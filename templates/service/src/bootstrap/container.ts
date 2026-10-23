import type { Config } from "@/config";
import type { INoteUnitOfWork } from "@/interfaces/note/repository.interface"; // @example-domain
import { MemoryNoteUnitOfWork } from "@/repositories/memory/note.unit-of-work"; // @example-domain
import { PostgresNoteUnitOfWork } from "@/repositories/postgres/note.unit-of-work"; // @example-domain
import type { RouteServices } from "@/routes";
import { NoteService } from "@/services/note.service"; // @example-domain
import {
  AUTH_CONSUMER_TOPICS,
  JwtTokenVerifier,
  KeyValueSessionRevocationStore,
  createAuthEventHandlers,
  createJwksKeyResolver,
} from "@driversim/auth";
import type { BackgroundWorker, Runtime, ServiceContainer } from "@driversim/bootstrap";
import { newId } from "@driversim/core"; // @example-domain
import {
  type EventConsumer,
  type EventHandlerMap,
  type EventPublisher,
  type InboxStore,
  type KeyValueStore,
  type OutboxRelay,
  type ReadinessCheck,
  type SessionRevocationStore,
  type StartupReport,
  type StartupTask,
  type TokenVerifier,
  runStartupTasks,
} from "@driversim/core";
import {
  KafkaAdminProbe,
  KafkaEventConsumer,
  KafkaEventPublisher,
  MemoryEventBus,
  MemoryInboxStore,
  MemoryOutbox,
  MemoryOutboxRelay,
  PostgresInboxStore,
  PostgresOutboxRelay,
  createKafkaClient,
} from "@driversim/messaging";
import { createPostgresClient, postgresReadinessCheck, postgresStartupTask } from "@driversim/postgres";
import {
  MemoryKeyValueStore,
  RedisKeyValueStore,
  createRedisClient,
  keyValueReadinessCheck,
} from "@driversim/redis";
import type { SQL } from "bun";

export type AdapterMode = "infrastructure" | "memory";

export interface Container extends ServiceContainer {
  config: Config;
  /** Process-wide logger, metrics and clock, created once by the shared runtime. */
  runtime: Runtime;
  sql: SQL | null;
  keyValue: KeyValueStore;
  tokenVerifier: TokenVerifier;
  revocations: SessionRevocationStore;
  publisher: EventPublisher;
  outboxRelay: OutboxRelay;
  consumer: EventConsumer | null;
  readinessChecks: ReadinessCheck[];
  /** Connections and prefetches performed once by `initialize()`. */
  startupTasks: StartupTask[];
  /** Background processes started by the runtime after initialization. */
  workers: BackgroundWorker[];
  adapters: { database: AdapterMode; cache: AdapterMode; messaging: AdapterMode };
  services: RouteServices;
  /**
   * Opens every connection (Postgres, Redis, Kafka) and prefetches auth keys before the server
   * accepts traffic, so no request pays for initialization. Idempotent; rejects with a
   * StartupError when a critical dependency is unreachable.
   */
  initialize(): Promise<StartupReport>;
  /** Releases resources in reverse creation order. */
  close(): Promise<void>;
}

/** Test/dev hooks to replace individual adapters without touching the wiring. */
export interface ContainerOverrides {
  tokenVerifier?: TokenVerifier;
  keyValue?: KeyValueStore;
  publisher?: EventPublisher;
}

/**
 * Composition root, built ONCE at startup. Chooses real adapters when their connection settings
 * exist and in-memory adapters otherwise (config validation forbids the memory fallback in
 * production). It never creates loggers, metrics or clocks: those come from the shared runtime.
 */
export const createContainer = (
  config: Config,
  runtime: Runtime,
  overrides: ContainerOverrides = {},
): Container => {
  const { logger, metrics, clock } = runtime;
  const closers: Array<() => Promise<void>> = [];
  const readinessChecks: ReadinessCheck[] = [];
  const startupTasks: StartupTask[] = [];

  // ── PostgreSQL ──────────────────────────────────────────────────────────────
  const sql = config.database.url
    ? createPostgresClient({
        ...config.database,
        url: config.database.url,
        applicationName: config.app.serviceName,
      })
    : null;
  if (sql) {
    startupTasks.push(postgresStartupTask(sql));
    readinessChecks.push(postgresReadinessCheck(sql));
    closers.push(() => sql.close({ timeout: 5 }));
  }

  // ── Redis ───────────────────────────────────────────────────────────────────
  let keyValue = overrides.keyValue;
  if (!keyValue) {
    if (config.redis.url) {
      const redis = createRedisClient({ ...config.redis, url: config.redis.url });
      const redisStore = new RedisKeyValueStore(redis, config.redis.keyPrefix);
      startupTasks.push({ name: "redis", critical: true, run: () => redisStore.connect() });
      readinessChecks.push(keyValueReadinessCheck(redisStore));
      keyValue = redisStore;
    } else {
      keyValue = new MemoryKeyValueStore(clock);
    }
  }
  const store = keyValue;
  closers.push(() => store.close());

  // ── Auth (JWKS from auth-service) ───────────────────────────────────────────
  const tokenVerifier =
    overrides.tokenVerifier ?? new JwtTokenVerifier(createJwksKeyResolver(config.auth), config.auth);
  const revocations = new KeyValueSessionRevocationStore(store);
  if (tokenVerifier.warmUp) {
    const verifier = tokenVerifier;
    // Non-critical: auth-service may start after this service; keys are then fetched lazily.
    startupTasks.push({
      name: "auth-jwks",
      critical: false,
      run: () => verifier.warmUp?.() ?? Promise.resolve(),
    });
  }

  // ── Messaging (Redpanda/Kafka) ──────────────────────────────────────────────
  const kafka =
    config.kafka.brokers.length > 0 && !overrides.publisher
      ? createKafkaClient(
          { ...config.kafka, clientId: config.kafka.clientId ?? config.app.serviceName },
          logger,
        )
      : null;
  const kafkaPublisher = kafka ? new KafkaEventPublisher(kafka) : null;
  const publisher: EventPublisher = overrides.publisher ?? kafkaPublisher ?? new MemoryEventBus();
  if (kafka && kafkaPublisher) {
    const probe = new KafkaAdminProbe(kafka);
    readinessChecks.push(probe.readinessCheck());
    // Non-critical: the outbox buffers events until the broker is reachable.
    startupTasks.push({
      name: "kafka",
      critical: false,
      run: async () => {
        await Promise.all([kafkaPublisher.connect(), probe.connect()]);
      },
    });
    closers.push(() => probe.close());
  }

  // ── Domains ─────────────────────────────────────────────────────────────────
  const memoryOutbox = new MemoryOutbox();
  // @example-domain:start
  const noteUnitOfWork: INoteUnitOfWork = sql
    ? new PostgresNoteUnitOfWork(sql)
    : new MemoryNoteUnitOfWork(memoryOutbox);
  // @example-domain:end
  const services: RouteServices = {
    // @example-domain:start
    note: new NoteService({
      unitOfWork: noteUnitOfWork,
      clock,
      newId,
      serviceName: config.app.serviceName,
    }),
    // @example-domain:end
  };

  // ── Outbox relay & consumers ────────────────────────────────────────────────
  const outboxRelay: OutboxRelay = sql
    ? new PostgresOutboxRelay(sql, publisher, config.outbox, logger, metrics)
    : new MemoryOutboxRelay(memoryOutbox, publisher, config.outbox, logger);

  const handlers: EventHandlerMap = { ...createAuthEventHandlers({ revocations, logger }) };
  const inbox: InboxStore = sql ? new PostgresInboxStore(sql) : new MemoryInboxStore();
  let consumer: EventConsumer | null = null;
  if (kafka && config.kafka.consumerEnabled) {
    consumer = new KafkaEventConsumer(kafka, {
      groupId: config.kafka.consumerGroup ?? config.app.serviceName,
      topics: [...AUTH_CONSUMER_TOPICS],
      handlers,
      inbox,
      logger,
    });
  } else if (publisher instanceof MemoryEventBus) {
    for (const [type, handler] of Object.entries(handlers)) publisher.subscribe(type, handler);
  }
  closers.push(() => publisher.close());

  const workers: BackgroundWorker[] = [];
  if (config.outbox.relayEnabled) {
    workers.push({ name: "outbox-relay", start: () => outboxRelay.start(), stop: () => outboxRelay.stop() });
  }
  if (consumer) {
    const eventConsumer = consumer;
    workers.push({
      name: "event-consumer",
      start: () => eventConsumer.start(),
      stop: () => eventConsumer.stop(),
    });
  }

  let initialized: Promise<StartupReport> | null = null;

  return {
    config,
    runtime,
    sql,
    keyValue: store,
    tokenVerifier,
    revocations,
    publisher,
    outboxRelay,
    consumer,
    readinessChecks,
    startupTasks,
    workers,
    adapters: {
      database: sql ? "infrastructure" : "memory",
      cache: config.redis.url && !overrides.keyValue ? "infrastructure" : "memory",
      messaging: kafka ? "infrastructure" : "memory",
    },
    services,
    initialize() {
      initialized ??= runStartupTasks(startupTasks, logger);
      return initialized;
    },
    async close() {
      for (const close of closers.reverse()) {
        try {
          await close();
        } catch (error) {
          logger.warn("resource close failed", { err: error });
        }
      }
    },
  };
};

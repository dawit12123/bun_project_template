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
import { newId } from "@driversim/core"; // @example-domain
import {
  type Clock,
  type EventConsumer,
  type EventHandlerMap,
  type EventPublisher,
  type InboxStore,
  type KeyValueStore,
  type Logger,
  type OutboxRelay,
  type ReadinessCheck,
  type SessionRevocationStore,
  type TokenVerifier,
  systemClock,
} from "@driversim/core";
import {
  KafkaEventConsumer,
  KafkaEventPublisher,
  MemoryEventBus,
  MemoryInboxStore,
  MemoryOutbox,
  MemoryOutboxRelay,
  PostgresInboxStore,
  PostgresOutboxRelay,
  createKafkaClient,
  kafkaReadinessCheck,
} from "@driversim/messaging";
import { PrometheusMetrics } from "@driversim/observability";
import { createPostgresClient, postgresReadinessCheck } from "@driversim/postgres";
import {
  MemoryKeyValueStore,
  RedisKeyValueStore,
  createRedisClient,
  keyValueReadinessCheck,
} from "@driversim/redis";
import type { SQL } from "bun";

export type AdapterMode = "infrastructure" | "memory";

export interface Container {
  config: Config;
  logger: Logger;
  clock: Clock;
  metrics: PrometheusMetrics;
  sql: SQL | null;
  keyValue: KeyValueStore;
  tokenVerifier: TokenVerifier;
  revocations: SessionRevocationStore;
  publisher: EventPublisher;
  outboxRelay: OutboxRelay;
  consumer: EventConsumer | null;
  readinessChecks: ReadinessCheck[];
  adapters: { database: AdapterMode; cache: AdapterMode; messaging: AdapterMode };
  services: RouteServices;
  /** Releases resources in reverse creation order. */
  close(): Promise<void>;
}

/** Test/dev hooks to replace individual adapters without touching the wiring. */
export interface ContainerOverrides {
  clock?: Clock;
  tokenVerifier?: TokenVerifier;
  keyValue?: KeyValueStore;
  publisher?: EventPublisher;
}

/**
 * Composition root. Chooses real adapters when their connection settings exist and in-memory
 * adapters otherwise (config validation forbids the memory fallback in production).
 */
export const createContainer = (
  config: Config,
  logger: Logger,
  overrides: ContainerOverrides = {},
): Container => {
  const closers: Array<() => Promise<void>> = [];
  const readinessChecks: ReadinessCheck[] = [];
  const clock = overrides.clock ?? systemClock;
  const metrics = new PrometheusMetrics({
    serviceName: config.app.serviceName,
    collectDefaults: config.metrics.collectDefaults,
  });

  // ── PostgreSQL ──────────────────────────────────────────────────────────────
  const sql = config.database.url
    ? createPostgresClient({
        ...config.database,
        url: config.database.url,
        applicationName: config.app.serviceName,
      })
    : null;
  if (sql) {
    readinessChecks.push(postgresReadinessCheck(sql));
    closers.push(() => sql.close({ timeout: 5 }));
  }

  // ── Redis ───────────────────────────────────────────────────────────────────
  let keyValue = overrides.keyValue;
  if (!keyValue) {
    if (config.redis.url) {
      const redis = createRedisClient({ ...config.redis, url: config.redis.url });
      keyValue = new RedisKeyValueStore(redis, config.redis.keyPrefix);
      readinessChecks.push(keyValueReadinessCheck(keyValue));
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

  // ── Messaging (Redpanda/Kafka) ──────────────────────────────────────────────
  const kafka =
    config.kafka.brokers.length > 0 && !overrides.publisher
      ? createKafkaClient(
          { ...config.kafka, clientId: config.kafka.clientId ?? config.app.serviceName },
          logger,
        )
      : null;
  const publisher: EventPublisher =
    overrides.publisher ?? (kafka ? new KafkaEventPublisher(kafka) : new MemoryEventBus());
  if (kafka) readinessChecks.push(kafkaReadinessCheck(kafka));

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

  return {
    config,
    logger,
    clock,
    metrics,
    sql,
    keyValue: store,
    tokenVerifier,
    revocations,
    publisher,
    outboxRelay,
    consumer,
    readinessChecks,
    adapters: {
      database: sql ? "infrastructure" : "memory",
      cache: config.redis.url && !overrides.keyValue ? "infrastructure" : "memory",
      messaging: kafka ? "infrastructure" : "memory",
    },
    services,
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

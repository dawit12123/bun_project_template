import type { EventEnvelope, OutboundMessage } from "@driversim/core";
import type { Logger } from "@driversim/core";
import type { EventPublisher } from "@driversim/core";
import type { MetricsRecorder } from "@driversim/core";
import type { OutboxRelay } from "@driversim/core";
import type { SQL } from "bun";
import { MESSAGING_TABLES } from "../constants/messaging.constants";
import { OUTBOX_RETRY } from "../constants/messaging.constants";
import type { MemoryOutbox } from "./outbox.writer";

export interface OutboxRelayOptions {
  pollIntervalMs: number;
  batchSize: number;
  /** After this many failed attempts a row is dead-lettered. */
  maxAttempts: number;
  /** Published rows older than this are purged by `purgePublished()`. */
  retentionHours: number;
}

/** Shared polling loop: drains immediately while batches are full, then waits for the interval. */
abstract class PollingOutboxRelay implements OutboxRelay {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running = false;
  #inFlight: Promise<unknown> = Promise.resolve();

  protected constructor(
    protected readonly config: Pick<OutboxRelayOptions, "pollIntervalMs" | "batchSize">,
    protected readonly logger: Logger,
  ) {}

  abstract tick(): Promise<number>;

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#schedule(0);
  }

  async stop(): Promise<void> {
    this.#running = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    await this.#inFlight;
  }

  #schedule(delayMs: number): void {
    if (!this.#running) return;
    this.#timer = setTimeout(() => {
      const run = this.tick()
        .then((published) =>
          this.#schedule(published >= this.config.batchSize ? 0 : this.config.pollIntervalMs),
        )
        .catch((error: unknown) => {
          this.logger.error("outbox relay tick failed", { err: error });
          this.#schedule(this.config.pollIntervalMs);
        });
      this.#inFlight = run;
    }, delayMs);
  }
}

interface OutboxRow {
  id: string;
  topic: string;
  message_key: string;
  payload: EventEnvelope | string;
  attempts: number;
}

/**
 * Publishes committed outbox rows. Rows are claimed with FOR UPDATE SKIP LOCKED, so several
 * replicas can relay concurrently without double-publishing. Failures back off exponentially;
 * after `maxAttempts` a row is dead-lettered for manual inspection.
 */
export class PostgresOutboxRelay extends PollingOutboxRelay {
  readonly #table = MESSAGING_TABLES.OUTBOX;

  constructor(
    private readonly sql: SQL,
    private readonly publisher: EventPublisher,
    config: OutboxRelayOptions,
    logger: Logger,
    private readonly metrics?: MetricsRecorder,
  ) {
    super(config, logger.child({ component: "outbox-relay" }));
    this.#settings = config;
  }

  readonly #settings: OutboxRelayOptions;

  async tick(): Promise<number> {
    return (await this.sql.begin(async (tx) => {
      const rows = (await tx`
        select id, topic, message_key, payload, attempts
        from ${tx(this.#table)}
        where published_at is null and dead_lettered_at is null and available_at <= now()
        order by available_at, id
        limit ${this.#settings.batchSize}
        for update skip locked`) as OutboxRow[];
      if (rows.length === 0) return 0;

      const ids = rows.map((row) => row.id);
      const messages: OutboundMessage[] = rows.map((row) => ({
        topic: row.topic,
        key: row.message_key,
        envelope: typeof row.payload === "string" ? (JSON.parse(row.payload) as EventEnvelope) : row.payload,
      }));

      try {
        await this.publisher.publish(messages);
      } catch (error) {
        const reason = error instanceof Error ? error.message.slice(0, 500) : "publish failed";
        await tx`
          update ${tx(this.#table)}
          set attempts = attempts + 1,
              last_error = ${reason},
              dead_lettered_at = case when attempts + 1 >= ${this.#settings.maxAttempts} then now() end,
              available_at = now() + make_interval(secs => least(
                ${OUTBOX_RETRY.BASE_DELAY_MS / 1_000} * power(2, attempts),
                ${OUTBOX_RETRY.MAX_DELAY_MS / 1_000}))
          where id in ${tx(ids)}`;
        this.metrics?.recordOutboxFailed(rows.length);
        this.logger.warn("outbox publish failed; will retry", { count: rows.length, err: error });
        return 0;
      }

      await tx`update ${tx(this.#table)} set published_at = now(), attempts = attempts + 1 where id in ${tx(ids)}`;
      this.metrics?.recordOutboxPublished(rows.length);
      return rows.length;
    })) as number;
  }

  /** Deletes published rows older than the retention window; returns the number removed. */
  async purgePublished(): Promise<number> {
    const rows = await this.sql`
      delete from ${this.sql(this.#table)}
      where published_at < now() - make_interval(hours => ${this.#settings.retentionHours})
      returning id`;
    return rows.length;
  }
}

/** Relay for the in-memory adapter set (development without Postgres, tests). */
export class MemoryOutboxRelay extends PollingOutboxRelay {
  constructor(
    private readonly outbox: MemoryOutbox,
    private readonly publisher: EventPublisher,
    config: Pick<OutboxRelayOptions, "pollIntervalMs" | "batchSize">,
    logger: Logger,
  ) {
    super(config, logger.child({ component: "outbox-relay" }));
  }

  async tick(): Promise<number> {
    const batch = this.outbox.pending.splice(0, this.config.batchSize);
    if (batch.length === 0) return 0;
    try {
      await this.publisher.publish(batch);
      return batch.length;
    } catch (error) {
      this.outbox.pending.unshift(...batch);
      throw error;
    }
  }
}

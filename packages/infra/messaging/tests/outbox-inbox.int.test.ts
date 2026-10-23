import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { toOutboundMessages } from "@driversim/core";
import { newId } from "@driversim/core";
import type { EventEnvelope } from "@driversim/core";
import type { EventPublisher } from "@driversim/core";
import { describeWithDatabase, resetTestDatabase, silentLogger } from "@driversim/testing";
import { MemoryEventBus } from "../src/memory/memory.event-bus";
import { PostgresInboxStore } from "../src/outbox/inbox.store";
import { PostgresOutboxRelay } from "../src/outbox/outbox.relay";
import { PostgresOutboxWriter } from "../src/outbox/outbox.writer";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");
import type { SQL } from "bun";

const relayConfig = {
  relayEnabled: true,
  pollIntervalMs: 50,
  batchSize: 10,
  maxAttempts: 2,
  retentionHours: 1,
};

/** Writes `count` events for one aggregate through the transactional outbox writer. */
const enqueue = async (sql: SQL, count: number, aggregateId = newId()): Promise<void> => {
  const events = Array.from({ length: count }, (_, index) => ({
    type: `probe.event_${index}`,
    version: 1,
    aggregateId,
    occurredAt: new Date(),
    payload: { index },
  }));
  await sql.begin(async (tx) => {
    const writer = new PostgresOutboxWriter(tx);
    for (const message of toOutboundMessages(events, { source: "svc", topic: "probe.events.v1" })) {
      await writer.add(message);
    }
  });
};

describeWithDatabase("Outbox relay & inbox", () => {
  let sql: SQL;

  beforeAll(async () => {
    sql = await resetTestDatabase(MIGRATIONS_DIR);
  });
  beforeEach(async () => {
    await sql`truncate event_outbox, event_inbox`;
  });
  afterAll(async () => {
    await sql?.close();
  });

  test("relay publishes committed events in order and marks them published", async () => {
    const bus = new MemoryEventBus();
    const relay = new PostgresOutboxRelay(sql, bus, relayConfig, silentLogger);
    await enqueue(sql, 3);

    expect(await relay.tick()).toBe(3);
    expect(bus.published.map((m) => m.envelope.type)).toEqual([
      "probe.event_0",
      "probe.event_1",
      "probe.event_2",
    ]);
    expect(await relay.tick()).toBe(0);
    const [{ pending }] =
      await sql`select count(*)::int as pending from event_outbox where published_at is null`;
    expect(pending).toBe(0);
  });

  test("rolled-back transactions never reach the outbox", async () => {
    await expect(
      sql.begin(async (tx) => {
        await new PostgresOutboxWriter(tx).add(
          toOutboundMessages(
            [
              {
                type: "probe.rolled_back",
                version: 1,
                aggregateId: newId(),
                occurredAt: new Date(),
                payload: {},
              },
            ],
            { source: "svc", topic: "probe.events.v1" },
          )[0] as never,
        );
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await sql`select 1 from event_outbox`).toHaveLength(0);
  });

  test("broker failures back off, then dead-letter after max attempts", async () => {
    const failing: EventPublisher = {
      publish: async () => {
        throw new Error("broker down");
      },
      close: async () => {},
    };
    const relay = new PostgresOutboxRelay(sql, failing, relayConfig, silentLogger);
    await enqueue(sql, 1);

    expect(await relay.tick()).toBe(0);
    let [row] = await sql`select attempts, last_error, available_at > now() as delayed from event_outbox`;
    expect(row).toMatchObject({ attempts: 1, last_error: "broker down", delayed: true });

    await sql`update event_outbox set available_at = now()`;
    await relay.tick();
    [row] = await sql`select attempts, dead_lettered_at is not null as dead from event_outbox`;
    expect(row).toMatchObject({ attempts: 2, dead: true });
    expect(await relay.tick()).toBe(0);
  });

  test("two relays never publish the same row twice", async () => {
    const bus = new MemoryEventBus();
    for (let index = 0; index < 8; index += 1) await enqueue(sql, 1);
    const relays = [1, 2].map(() => new PostgresOutboxRelay(sql, bus, relayConfig, silentLogger));
    await Promise.all(relays.map((relay) => relay.tick()));
    await Promise.all(relays.map((relay) => relay.tick()));
    const ids = bus.published.map((m) => m.envelope.id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });

  test("inbox processes each event once per consumer and rolls back on handler failure", async () => {
    const inbox = new PostgresInboxStore(sql);
    const envelope: EventEnvelope = {
      id: newId(),
      type: "auth.session.revoked",
      version: 1,
      source: "auth-service",
      occurredAt: new Date().toISOString(),
      subject: newId(),
      schoolId: null,
      correlationId: null,
      causationId: null,
      data: {},
    };
    let calls = 0;

    await expect(
      inbox.processOnce("svc", envelope, async () => {
        throw new Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");
    expect(await inbox.processOnce("svc", envelope, async () => void calls++)).toBe(true);
    expect(await inbox.processOnce("svc", envelope, async () => void calls++)).toBe(false);
    expect(await inbox.processOnce("other-consumer", envelope, async () => void calls++)).toBe(true);
    expect(calls).toBe(2);
  });
});

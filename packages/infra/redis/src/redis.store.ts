import type { CounterResult, KeyValueStore } from "@driversim/core";
import type { RedisClient } from "bun";

/** INCR + EXPIRE in one atomic step, so a counter can never be left without a TTL. */
const INCREMENT_WITH_TTL = `
local value = redis.call('INCR', KEYS[1])
if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return { value, ttl }`;

export class RedisKeyValueStore implements KeyValueStore {
  constructor(
    private readonly client: RedisClient,
    private readonly prefix = "",
  ) {}

  #key(key: string): string {
    return `${this.prefix}${key}`;
  }

  get(key: string): Promise<string | null> {
    return this.client.get(this.#key(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds === undefined) await this.client.set(this.#key(key), value);
    else await this.client.set(this.#key(key), value, "EX", Math.max(1, Math.ceil(ttlSeconds)));
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.send("SET", [
      this.#key(key),
      value,
      "EX",
      String(Math.max(1, Math.ceil(ttlSeconds))),
      "NX",
    ]);
    return result === "OK";
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.#key(key));
  }

  async increment(key: string, ttlSeconds: number): Promise<CounterResult> {
    const [value, ttl] = (await this.client.send("EVAL", [
      INCREMENT_WITH_TTL,
      "1",
      this.#key(key),
      String(Math.max(1, Math.ceil(ttlSeconds))),
    ])) as [number, number];
    return { value: Number(value), ttlSeconds: Number(ttl) };
  }

  /** Opens the connection; called at startup so the first request does not pay for it. */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  async ping(): Promise<void> {
    await this.client.send("PING", []);
  }

  async close(): Promise<void> {
    this.client.close();
  }
}

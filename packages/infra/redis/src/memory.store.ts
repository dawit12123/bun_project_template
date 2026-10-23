import { systemClock } from "@driversim/core";
import type { Clock } from "@driversim/core";
import type { CounterResult, KeyValueStore } from "@driversim/core";

interface Entry {
  value: string;
  expiresAt: number | null;
}

/** In-process KeyValueStore for development and tests. Not shared across instances. */
export class MemoryKeyValueStore implements KeyValueStore {
  readonly #entries = new Map<string, Entry>();

  constructor(private readonly clock: Clock = systemClock) {}

  #now(): number {
    return this.clock.now().getTime();
  }

  #live(key: string): Entry | undefined {
    const entry = this.#entries.get(key);
    if (entry?.expiresAt !== null && entry !== undefined && entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry;
  }

  #expiry(ttlSeconds?: number): number | null {
    return ttlSeconds === undefined ? null : this.#now() + Math.max(1, Math.ceil(ttlSeconds)) * 1_000;
  }

  async get(key: string): Promise<string | null> {
    return this.#live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.#entries.set(key, { value, expiresAt: this.#expiry(ttlSeconds) });
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.#live(key)) return false;
    this.#entries.set(key, { value, expiresAt: this.#expiry(ttlSeconds) });
    return true;
  }

  async delete(key: string): Promise<void> {
    this.#entries.delete(key);
  }

  async increment(key: string, ttlSeconds: number): Promise<CounterResult> {
    const entry = this.#live(key);
    const expiresAt = entry?.expiresAt ?? this.#expiry(ttlSeconds) ?? this.#now();
    const value = Number(entry?.value ?? "0") + 1;
    this.#entries.set(key, { value: String(value), expiresAt });
    return { value, ttlSeconds: Math.max(0, Math.ceil((expiresAt - this.#now()) / 1_000)) };
  }

  async ping(): Promise<void> {}

  async close(): Promise<void> {
    this.#entries.clear();
  }
}

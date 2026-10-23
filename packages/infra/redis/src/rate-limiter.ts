import type { KeyValueStore } from "@driversim/core";
import type { RateLimitDecision, RateLimiter } from "@driversim/core";

export interface FixedWindowOptions {
  /** Distinguishes limiters sharing one store, e.g. `api`, `login`, `otp-resend`. */
  name: string;
  limit: number;
  windowSeconds: number;
}

/** Fixed-window counter: cheap, atomic on Redis, good enough for abuse protection. */
export class FixedWindowRateLimiter implements RateLimiter {
  constructor(
    private readonly store: KeyValueStore,
    readonly options: FixedWindowOptions,
  ) {}

  async consume(key: string): Promise<RateLimitDecision> {
    const { value, ttlSeconds } = await this.store.increment(
      `ratelimit:${this.options.name}:${key}`,
      this.options.windowSeconds,
    );
    return {
      allowed: value <= this.options.limit,
      limit: this.options.limit,
      remaining: Math.max(0, this.options.limit - value),
      resetSeconds: ttlSeconds,
    };
  }
}

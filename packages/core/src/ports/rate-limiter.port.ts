export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets. */
  resetSeconds: number;
}

export interface RateLimiter {
  consume(key: string): Promise<RateLimitDecision>;
}

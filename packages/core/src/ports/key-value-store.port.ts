export interface CounterResult {
  value: number;
  /** Seconds until the counter expires. */
  ttlSeconds: number;
}

/** Port for short-lived state: throttling counters, revocation markers, OTP challenges. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Atomically sets the key only if it does not exist. Returns true when the key was set. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Atomically increments a counter, starting its TTL on first increment. */
  increment(key: string, ttlSeconds: number): Promise<CounterResult>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

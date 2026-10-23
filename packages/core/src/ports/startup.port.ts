/**
 * Work done once while the service boots (open pools, connect clients, prefetch keys) so no
 * request pays for initialization. Critical tasks abort startup when they fail; non-critical
 * ones only log, and the adapter retries lazily.
 */
export interface StartupTask {
  name: string;
  critical: boolean;
  /** Defaults to 10 seconds. */
  timeoutMs?: number;
  run(): Promise<void>;
}

export interface StartupReport {
  durationMs: number;
  tasks: Array<{
    name: string;
    critical: boolean;
    status: "ok" | "failed";
    durationMs: number;
    error?: string;
  }>;
}

export interface ReadinessCheck {
  name: string;
  /** Non-critical checks are reported but never fail readiness. Defaults to true. */
  critical?: boolean;
  timeoutMs?: number;
  check(): Promise<void>;
}

export type DependencyStatus = "up" | "down";

export interface ReadinessReport {
  status: "ready" | "not_ready";
  checks: Record<string, { status: DependencyStatus; critical: boolean; durationMs: number }>;
}

import { booleanFlag } from "@driversim/core";
import { z } from "zod";

export const metricsEnvSchema = z.object({
  METRICS_ENABLED: booleanFlag(true),
  METRICS_DEFAULT_COLLECTORS: booleanFlag(true),
});

export interface MetricsConfig {
  enabled: boolean;
  collectDefaults: boolean;
}

export const toMetricsConfig = (env: z.infer<typeof metricsEnvSchema>): MetricsConfig => ({
  enabled: env.METRICS_ENABLED,
  collectDefaults: env.METRICS_DEFAULT_COLLECTORS,
});

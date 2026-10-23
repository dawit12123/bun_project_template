import { booleanFlag } from "@driversim/core";
import { z } from "zod";

export const outboxEnvSchema = z.object({
  OUTBOX_RELAY_ENABLED: booleanFlag(true),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(1_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(100),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(20),
  OUTBOX_RETENTION_HOURS: z.coerce.number().int().min(1).default(72),
});

export interface OutboxConfig {
  relayEnabled: boolean;
  pollIntervalMs: number;
  batchSize: number;
  maxAttempts: number;
  retentionHours: number;
}

export const toOutboxConfig = (env: z.infer<typeof outboxEnvSchema>): OutboxConfig => ({
  relayEnabled: env.OUTBOX_RELAY_ENABLED,
  pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
  batchSize: env.OUTBOX_BATCH_SIZE,
  maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
  retentionHours: env.OUTBOX_RETENTION_HOURS,
});

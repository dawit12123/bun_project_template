import { booleanFlag } from "@driversim/core";
import { z } from "zod";

export const loggerEnvSchema = z.object({
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  LOG_PRETTY: booleanFlag(false),
});

export interface LoggerConfig {
  level: z.infer<typeof loggerEnvSchema>["LOG_LEVEL"];
  pretty: boolean;
}

export const toLoggerConfig = (env: z.infer<typeof loggerEnvSchema>): LoggerConfig => ({
  level: env.LOG_LEVEL,
  pretty: env.LOG_PRETTY,
});

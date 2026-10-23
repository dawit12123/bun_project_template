import type { Clock } from "@driversim/core";
import type { Logger } from "@driversim/core";
import type { SQL } from "bun";

export interface SeedContext {
  sql: SQL;
  logger: Logger;
  clock: Clock;
}

/** Initial data. Seeds must be idempotent (safe to run repeatedly). */
export interface Seed {
  name: string;
  /** Environments the seed may run in; production seeds must be explicit. */
  environments: readonly string[];
  run(context: SeedContext): Promise<void>;
}

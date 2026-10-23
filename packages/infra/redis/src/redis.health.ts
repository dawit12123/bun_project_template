import type { ReadinessCheck } from "@driversim/core";
import type { KeyValueStore } from "@driversim/core";

export const keyValueReadinessCheck = (store: KeyValueStore, name = "redis"): ReadinessCheck => ({
  name,
  critical: true,
  timeoutMs: 1_000,
  check: () => store.ping(),
});

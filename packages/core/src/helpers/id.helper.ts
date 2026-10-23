import type { IdGenerator } from "../types/clock.interface";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Time-ordered UUIDv7: index-friendly and sortable by creation time. */
export const newId: IdGenerator = () => Bun.randomUUIDv7();

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

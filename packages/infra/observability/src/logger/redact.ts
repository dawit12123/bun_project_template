import { REDACTED_FIELD_NAMES, REDACTED_PLACEHOLDER } from "@driversim/core";

const MAX_DEPTH = 8;

export const normalizeFieldName = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const DEFAULT_KEYS: ReadonlySet<string> = new Set(REDACTED_FIELD_NAMES.map(normalizeFieldName));

export const serializeError = (error: Error, depth = 0): Record<string, unknown> => {
  const serialized: Record<string, unknown> = {
    type: error.name,
    message: error.message,
    stack: error.stack,
  };
  const code = (error as { code?: unknown }).code;
  if (code !== undefined) serialized.code = code;
  if (error.cause instanceof Error && depth < 3) serialized.cause = serializeError(error.cause, depth + 1);
  return serialized;
};

/** Deep-copies `value`, masking sensitive keys, serializing errors and breaking cycles. */
export const redact = (
  value: unknown,
  keys: ReadonlySet<string> = DEFAULT_KEYS,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown => {
  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Error) return serializeError(value);
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[Truncated]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, keys, depth + 1, seen));
  if (value instanceof Map) return redact(Object.fromEntries(value), keys, depth, seen);
  if (value instanceof Set) return redact([...value], keys, depth, seen);

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = keys.has(normalizeFieldName(key))
      ? REDACTED_PLACEHOLDER
      : redact(entry, keys, depth + 1, seen);
  }
  return output;
};

export const buildRedactionKeys = (extra: readonly string[] = []): ReadonlySet<string> =>
  new Set([...DEFAULT_KEYS, ...extra.map(normalizeFieldName)]);

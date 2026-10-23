export const MESSAGING_TABLES = {
  OUTBOX: "event_outbox",
  INBOX: "event_inbox",
} as const;

export const EVENT_HEADERS = {
  EVENT_TYPE: "event-type",
  EVENT_VERSION: "event-version",
  CORRELATION_ID: "correlation-id",
  SOURCE: "source",
} as const;

export const OUTBOX_RETRY = {
  BASE_DELAY_MS: 1_000,
  MAX_DELAY_MS: 5 * 60_000,
} as const;

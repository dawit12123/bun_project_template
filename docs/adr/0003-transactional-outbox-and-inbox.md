# ADR-0003: Transactional outbox and idempotent inbox

- **Status:** accepted (2026-10-23)
- **Context:** Writing to the database and publishing to Redpanda are two systems. Publishing
  after commit can lose events, and publishing before commit can announce changes that roll back
  (Trello AUTH-041: "Committed changes requiring events are not silently lost").
- **Decision:**
  - Services write events to `event_outbox` inside the business transaction (unit of work).
  - A relay claims rows with `FOR UPDATE SKIP LOCKED`, publishes with an idempotent producer,
    retries with exponential backoff and dead-letters after `OUTBOX_MAX_ATTEMPTS`.
  - Consumers record `(consumer, event_id)` in `event_inbox` in the same transaction as the
    handler.
- **Consequences:** At-least-once delivery with effectively-once processing. Per-aggregate
  ordering (message key = aggregate id). Writes keep working while the broker is down, which is
  why the Kafka readiness check is non-critical. Published rows are purged after
  `OUTBOX_RETENTION_HOURS`.

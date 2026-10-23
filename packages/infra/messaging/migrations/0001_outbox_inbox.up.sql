-- Transactional outbox: events written in the same transaction as the business change,
-- relayed to Redpanda/Kafka by the outbox relay.
create table event_outbox (
  id               uuid        primary key,
  topic            text        not null,
  message_key      text        not null,
  event_type       text        not null,
  payload          jsonb       not null,
  created_at       timestamptz not null default now(),
  available_at     timestamptz not null default now(),
  published_at     timestamptz,
  attempts         integer     not null default 0,
  last_error       text,
  dead_lettered_at timestamptz
);

create index event_outbox_pending_idx
  on event_outbox (available_at, id)
  where published_at is null and dead_lettered_at is null;

create index event_outbox_published_idx
  on event_outbox (published_at)
  where published_at is not null;

-- Idempotent consumer: one row per (consumer group, event) already handled.
create table event_inbox (
  consumer     text        not null,
  event_id     uuid        not null,
  event_type   text        not null,
  processed_at timestamptz not null default now(),
  primary key (consumer, event_id)
);

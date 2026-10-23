-- EXAMPLE DOMAIN table (removed with --remove-example).
-- Cross-schema relations are plain foreign keys, e.g.:
--   created_by uuid not null references auth.users (id)
create table service_template.notes (
  id         uuid         primary key,
  school_id  uuid         not null,
  title      varchar(200) not null check (length(btrim(title)) > 0),
  body       text         not null default '' check (length(body) <= 10000),
  created_by uuid         not null,
  created_at timestamptz  not null,
  updated_at timestamptz  not null,
  version    integer      not null default 1 check (version > 0)
);

-- Keyset pagination per school (newest first) and "my notes" filtering.
create index notes_school_id_id_idx on service_template.notes (school_id, id desc);
create index notes_school_id_created_by_idx on service_template.notes (school_id, created_by, id desc);

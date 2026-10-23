create schema beta;
-- user_id belongs to alpha (other service)
create table beta.items (
  id uuid primary key,
  user_id uuid not null references alpha.users (id)
);

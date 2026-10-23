create schema beta;
-- references alpha.users (id) is only mentioned in this comment
create table beta.items (id uuid primary key, user_id uuid not null);

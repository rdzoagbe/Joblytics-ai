-- Idempotent migration: safe to run even if the columns already exist.
alter table public.analyses add column if not exists application_status text;
alter table public.analyses add column if not exists status_updated_at timestamptz;

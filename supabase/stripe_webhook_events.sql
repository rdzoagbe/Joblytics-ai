-- Stripe event idempotency ledger. Apply before deploying webhook changes.
-- No user-facing policies: only the service role writes to this table.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  status text not null check (status in ('processing', 'processed')),
  claimed_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;

-- ============================================================================
-- RUN_ME.sql — the one file to paste into the Supabase SQL Editor and Run.
-- Idempotent: safe to run multiple times, safe if parts already exist.
-- Covers the two pending migrations:
--   1. subscriptions        (required by the paid-tier entitlement fix, PR #95)
--   2. application_status   (required by the application pipeline tracker)
-- ============================================================================

-- 1. Server-authoritative subscription entitlement (see supabase/subscriptions.sql).
-- Written ONLY by the Stripe webhook (service-role). Users can read their own row,
-- never write it — user-writable metadata is exactly the bug this fixes.
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  stripe_product_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

-- Intentionally NO insert/update/delete policies: only the service-role key
-- (Stripe webhook) can write, because it bypasses RLS.

-- 2. Application pipeline status on analyses (see supabase/application_status.sql).
alter table public.analyses add column if not exists application_status text;
alter table public.analyses add column if not exists status_updated_at timestamptz;

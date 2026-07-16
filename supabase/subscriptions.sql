-- Server-authoritative subscription entitlement.
--
-- SECURITY: plan/entitlement must live somewhere the end user CANNOT write. Supabase
-- `user_metadata` (raw_user_meta_data) is editable by the user themselves via
-- supabase.auth.updateUser(), so trusting it for paid-tier gating let any logged-in user
-- grant themselves Pro. This table is written ONLY by the Stripe webhook using the
-- service-role key (which bypasses RLS). RLS below lets a user READ their own row (for UI)
-- but grants NO insert/update/delete to anon/authenticated, so clients can never mutate it.

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

-- A user may read (only) their own subscription row.
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

-- Intentionally NO insert/update/delete policies: only the service-role key (used by the
-- Stripe webhook) can write, because it bypasses RLS. Never expose the service-role key
-- to the client.

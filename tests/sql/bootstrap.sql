-- Disposable PostgreSQL 17 integration fixture. NEVER run against Joblytics Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema if not exists auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.subscriptions(
  user_id uuid primary key references auth.users(id),
  plan text not null default 'free',
  status text not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  stripe_product_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create table public.usage_events(
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  action text not null,
  status text not null default 'success',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table public.usage_events enable row level security;
alter table public.subscriptions enable row level security;
create policy "Users can insert own usage events" on public.usage_events
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can view own usage events" on public.usage_events
  for select to authenticated using (auth.uid() = user_id);
grant usage on schema public, auth to anon, authenticated, service_role;
grant select, insert on public.usage_events to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.usage_events, public.subscriptions to service_role;
insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

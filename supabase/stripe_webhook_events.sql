-- Joblytics Stripe event ledger and monotonic subscription writes.
-- REVIEW/TEST FIRST. Apply only to the verified Joblytics project.
-- Stripe events may be delivered more than once, concurrently, or out of order.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  status text not null check (status in ('processing', 'processed', 'failed')),
  claim_token uuid not null default pg_catalog.gen_random_uuid(),
  attempts integer not null default 1 check (attempts > 0),
  claimed_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update on public.stripe_webhook_events to service_role;

-- A monotonic per-user event cursor prevents an earlier Stripe event from
-- overwriting a later entitlement. No existing subscription rows are deleted.
alter table public.subscriptions
  add column if not exists stripe_event_created bigint not null default 0;

-- Exclusive claim, or re-claim only if failed or abandoned >10 minutes.
-- The UUID token prevents a worker with an expired claim from completing another's claim.
create or replace function public.claim_stripe_webhook_event(p_event_id text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_claim uuid;
  v_status text;
begin
  if p_event_id is null or p_event_id !~ '^evt_[a-zA-Z0-9_]+$'
     or length(p_event_id) > 255 then
    raise exception 'Invalid Stripe event id';
  end if;

  insert into public.stripe_webhook_events(event_id, status, claimed_at)
  values(p_event_id, 'processing', now())
  on conflict (event_id) do update set
    status = 'processing',
    claim_token = pg_catalog.gen_random_uuid(),
    attempts = public.stripe_webhook_events.attempts + 1,
    claimed_at = now(),
    processed_at = null
  where public.stripe_webhook_events.status = 'failed'
     or (public.stripe_webhook_events.status = 'processing'
         and public.stripe_webhook_events.claimed_at < now() - interval '10 minutes')
  returning claim_token into v_claim;

  if v_claim is not null then
    return pg_catalog.jsonb_build_object('state', 'claimed', 'token', v_claim);
  end if;

  select status into v_status
  from public.stripe_webhook_events
  where event_id = p_event_id;

  return pg_catalog.jsonb_build_object(
    'state', case when v_status = 'processed' then 'processed' else 'busy' end
  );
end;
$$;

create or replace function public.complete_stripe_webhook_event(
  p_event_id text, p_claim_token uuid, p_succeeded boolean
)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare v_rows integer;
begin
  update public.stripe_webhook_events
  set status = case when p_succeeded then 'processed' else 'failed' end,
      processed_at = case when p_succeeded then now() else null end
  where event_id = p_event_id
    and claim_token = p_claim_token
    and status = 'processing';
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- Stripe event timestamps are strictly monotonic per user, inside one DB transaction.
-- Only the service role can call this RPC. The server validates the user and Stripe
-- subscription, and derives the plan from configured Stripe price IDs.
create or replace function public.apply_stripe_subscription_state(
  p_user_id uuid, p_event_created bigint, p_state jsonb
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_last bigint := 0;
  v_applied boolean := false;
begin
  if p_user_id is null or p_event_created is null or p_event_created <= 0
     or p_state is null or p_state->>'stripe_subscription_id' is null
     or p_state->>'plan' not in ('starter', 'pro')
     or p_state->>'status' is null then
    raise exception 'Invalid subscription sync payload';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 1));

  select stripe_event_created into v_last from public.subscriptions
  where user_id = p_user_id;

  if coalesce(v_last, 0) > p_event_created then
    return pg_catalog.jsonb_build_object('applied', false, 'reason', 'older_event');
  end if;

  insert into public.subscriptions (
    user_id, plan, status, stripe_customer_id, stripe_subscription_id,
    stripe_price_id, stripe_product_id, current_period_end, updated_at,
    stripe_event_created
  ) values (
    p_user_id, p_state->>'plan', p_state->>'status',
    p_state->>'stripe_customer_id', p_state->>'stripe_subscription_id',
    p_state->>'stripe_price_id', p_state->>'stripe_product_id',
    nullif(p_state->>'current_period_end', '')::timestamptz, now(),
    p_event_created
  )
  on conflict (user_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    stripe_product_id = excluded.stripe_product_id,
    current_period_end = excluded.current_period_end,
    updated_at = now(),
    stripe_event_created = excluded.stripe_event_created;

  return pg_catalog.jsonb_build_object('applied', true);
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text)
  from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(text, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.apply_stripe_subscription_state(uuid, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text) to service_role;
grant execute on function public.complete_stripe_webhook_event(text, uuid, boolean) to service_role;
grant execute on function public.apply_stripe_subscription_state(uuid, bigint, jsonb) to service_role;

-- Joblytics ATS monthly quotas: server-only, atomic reservations.
-- Apply after review, BEFORE deploying the updated analyzer.
-- Reservations avoid concurrent requests exceeding the monthly allocation.
-- A crashed request's reservation expires after ten minutes.
create or replace function public.reserve_ats_analysis(p_user_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_plan text := 'free';
  v_limit integer := 3;
  v_used integer := 0;
  v_event_id uuid;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_user_id is null then raise exception 'User required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select case
    when s.plan in ('starter', 'plus') then 'starter'
    when s.plan = 'pro' then 'pro'
    else 'free'
  end into v_plan
  from public.subscriptions s
  where s.user_id = p_user_id
    and s.status in ('active', 'trialing', 'paid')
    and (s.current_period_end is null or s.current_period_end > now());

  v_plan := coalesce(v_plan, 'free');
  v_limit := case v_plan when 'pro' then 200 when 'starter' then 40 else 3 end;

  select count(*) into v_used
  from public.usage_events e
  where e.user_id = p_user_id
    and e.action = 'ats_analysis'
    and e.created_at >= v_month_start
    and (e.status = 'success' or (e.status = 'reserved' and e.created_at > now() - interval '10 minutes'));

  if v_used >= v_limit then
    return pg_catalog.jsonb_build_object('allowed', false, 'plan', v_plan, 'limit', v_limit, 'used', v_used, 'remaining', 0);
  end if;

  insert into public.usage_events(user_id, action, status, metadata)
  values(p_user_id, 'ats_analysis', 'reserved', '{}'::jsonb)
  returning id into v_event_id;

  return pg_catalog.jsonb_build_object('allowed', true, 'event_id', v_event_id, 'plan', v_plan, 'limit', v_limit, 'used', v_used + 1, 'remaining', v_limit - v_used - 1);
end;
$$;

create or replace function public.complete_ats_analysis(p_event_id uuid, p_user_id uuid, p_succeeded boolean)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare v_rows integer;
begin
  update public.usage_events
  set status = case when p_succeeded then 'success' else 'failed' end
  where id = p_event_id and user_id = p_user_id
    and action = 'ats_analysis' and status = 'reserved';
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.reserve_ats_analysis(uuid) from public, anon, authenticated;
revoke all on function public.complete_ats_analysis(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.reserve_ats_analysis(uuid) to service_role;
grant execute on function public.complete_ats_analysis(uuid, uuid, boolean) to service_role;

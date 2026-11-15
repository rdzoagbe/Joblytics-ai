-- Unit/integration assertions against disposable PostgreSQL, never production.
do $$
declare
  uid uuid := '11111111-1111-4111-8111-111111111111';
  b jsonb;
  e1 uuid;
  e2 uuid;
  e3 uuid;
  token1 uuid;
  token2 uuid;
begin
  if has_function_privilege('anon', 'public.reserve_ats_analysis(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.reserve_ats_analysis(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.claim_stripe_webhook_event(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.apply_stripe_subscription_state(uuid,bigint,jsonb)', 'EXECUTE') then
    raise exception 'Privileged RPC access leaked';
  end if;
  if not has_function_privilege('service_role', 'public.reserve_ats_analysis(uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.claim_stripe_webhook_event(text)', 'EXECUTE') then
    raise exception 'Service role RPC access not configured';
  end if;

  insert into public.usage_events(user_id,action,status)
  values(uid,'analysis','success');

  b := public.reserve_ats_analysis(uid);
  if not (b->>'allowed')::boolean or (b->>'used')::integer <> 2 then
    raise exception 'Legacy current-month usage was not counted: %', b;
  end if;
  e1 := (b->>'event_id')::uuid;
  b := public.reserve_ats_analysis(uid);
  if not (b->>'allowed')::boolean or (b->>'used')::integer <> 3 then
    raise exception 'Second reservation should be allowed: %', b;
  end if;
  e2 := (b->>'event_id')::uuid;
  b := public.reserve_ats_analysis(uid);
  if (b->>'allowed')::boolean then raise exception 'Quota exceeded allowed!'; end if;
  if not public.complete_ats_analysis(e1, uid, false) then
    raise exception 'Failed quota reservation could not be released';
  end if;
  b := public.reserve_ats_analysis(uid);
  if not (b->>'allowed')::boolean then raise exception 'Released quota not reusable: %', b; end if;
  e3 := (b->>'event_id')::uuid;
  if not public.complete_ats_analysis(e2, uid, true) or
     not public.complete_ats_analysis(e3, uid, true) then
    raise exception 'Completed quota reservation not committed';
  end if;
  b := public.reserve_ats_analysis(uid);
  if (b->>'allowed')::boolean then raise exception 'Completed usage was not counted'; end if;

  b := public.claim_stripe_webhook_event('evt_test_001');
  if b->>'state' <> 'claimed' then raise exception 'First Stripe claim failed: %', b; end if;
  token1 := (b->>'token')::uuid;
  b := public.claim_stripe_webhook_event('evt_test_001');
  if b->>'state' <> 'busy' then raise exception 'Duplicate in-progress Stripe event not blocked'; end if;
  if not public.complete_stripe_webhook_event('evt_test_001',token1,true) then
    raise exception 'Stripe event completion failed';
  end if;
  b := public.claim_stripe_webhook_event('evt_test_001');
  if b->>'state' <> 'processed' then raise exception 'Processed Stripe event replayed'; end if;

  b := public.claim_stripe_webhook_event('evt_test_002');
  token1 := (b->>'token')::uuid;
  if not public.complete_stripe_webhook_event('evt_test_002',token1,false) then
    raise exception 'Could not release failed Stripe event';
  end if;
  b := public.claim_stripe_webhook_event('evt_test_002');
  token2 := (b->>'token')::uuid;
  if b->>'state' <> 'claimed' or token1 = token2 then
    raise exception 'Failed Stripe event not reclaimable with a new token';
  end if;
  if public.complete_stripe_webhook_event('evt_test_002',token1,true) then
    raise exception 'Stale worker managed to finalize reclaimed event';
  end if;
  if not public.complete_stripe_webhook_event('evt_test_002',token2,true) then
    raise exception 'Current event owner could not finalize';
  end if;

  b := public.apply_stripe_subscription_state(uid, 100,
    '{"plan":"starter","status":"active","stripe_customer_id":"cus_a",
       "stripe_subscription_id":"sub_new","stripe_subscription_created":"50",
       "stripe_price_id":"price_test","stripe_product_id":"prod_test"}'::jsonb);
  if not (b->>'applied')::boolean then raise exception 'Subscription write failed: %',b; end if;
  b := public.apply_stripe_subscription_state(uid, 99,
    '{"plan":"free","status":"canceled","stripe_customer_id":"cus_a",
       "stripe_subscription_id":"sub_new","stripe_subscription_created":"50"}'::jsonb);
  if b->>'reason' <> 'older_event' then raise exception 'Older event was not rejected: %', b; end if;
  b := public.apply_stripe_subscription_state(uid, 105,
    '{"plan":"free","status":"canceled","stripe_customer_id":"cus_a",
       "stripe_subscription_id":"sub_old","stripe_subscription_created":"10"}'::jsonb);
  if b->>'reason' <> 'superseded_subscription' then
    raise exception 'Old subscription cancellation overwrote replacement: %', b;
  end if;
  if (select plan from public.subscriptions where user_id=uid) <> 'starter' then
    raise exception 'Valid paid entitlement lost';
  end if;
  b := public.apply_stripe_subscription_state(uid, 106,
    '{"plan":"free","status":"canceled","stripe_customer_id":"cus_a",
       "stripe_subscription_id":"sub_new","stripe_subscription_created":"50"}'::jsonb);
  if not (b->>'applied')::boolean then raise exception 'Real cancellation not applied'; end if;
  if (select status from public.subscriptions where user_id=uid) <> 'canceled' then
    raise exception 'Canceled subscription was not recorded';
  end if;
end $$;

-- Confirm authenticated users can record normal events but cannot forge billable ATS events.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
insert into public.usage_events(user_id,action,status)
values ('22222222-2222-4222-8222-222222222222','cover_letter','success');
do $$
begin
  begin
    insert into public.usage_events(user_id,action,status)
    values ('22222222-2222-4222-8222-222222222222','ats_analysis','success');
    raise exception 'Authenticated user forged ATS quota event';
  exception
    when insufficient_privilege then null;
  end;
end $$;
reset role;

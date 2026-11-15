# Joblytics AI — Stabilization release runbook (November 2026)

This change targets the existing **Vercel** application, existing **Supabase Joblytics** project, and existing **Sentry** organization. No hosting migration is needed.

## Scope

- Atomic monthly ATS quotas: Free 3, Starter 40, Pro 200 per UTC calendar month.
- Cached same-job/same-CV results are returned without a new quota reservation.
- Admin exemption: explicit server-side `ADMIN_USER_IDS` or `RATE_LIMIT_WHITELIST` **user IDs only**. Never trust client plan metadata.
- Concurrent analyses reserve capacity before calling Anthropic. Failed server processing releases the reservation. Abandoned reservations expire after ten minutes.
- Stripe signature timestamp limited to five minutes and webhook events deduplicated before subscription updates.
- Regression tests for quota failures and signed webhook validation.

## Deployment order — mandatory

1. **Keep this PR unmerged while preview builds and tests are checked.**
2. Confirm the Supabase project and take a backup before applying schema changes.
3. Apply `supabase/ats_usage_quotas.sql` to the intended Supabase project.
4. Apply `supabase/stripe_webhook_events.sql` to the same project.
5. Run the following safe checks in Supabase SQL Editor (no user records returned):

```sql
select routine_name from information_schema.routines
where routine_schema = 'public'
and routine_name in ('reserve_ats_analysis','complete_ats_analysis');
select to_regclass('public.stripe_webhook_events') is not null as webhook_ledger_ready;
select proname, proacl from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public' and proname in ('reserve_ats_analysis','complete_ats_analysis');
```

6. Confirm Vercel environment variables for the **correct deployment environment**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, and the existing client `VITE_*` variables. Never paste secret values into a PR or chat.
7. Deploy a Vercel preview and run `npm test` and `npm run build`.
8. Check signed-in analysis for a Free user, a paid user, and an exempt admin; verify quota errors, cache hits, and failed requests. Simulate **test-mode** Stripe retries, invalid signatures, and stale timestamps.
9. Review Sentry error trends and Vercel function logs; confirm there are no new quota RPC errors.
10. Only then merge and deploy to Vercel production. Monitor errors and billing/usage counts closely.

**Important:** Preview deployment connected to the same live Supabase project still uses live tables. Prefer a non-production Supabase project and Stripe test mode for preview. Do not run chargeable or destructive tests against real users.

## Explicitly deferred

- Legal notice and privacy policy need verified publisher/business details, data-retention decisions, and legal review before full paid launch.
- Smart Sync automatic status changes require company + role disambiguation and user confirmation for ambiguous matches.
- Chrome extension's broad host permissions need separate privacy/security review.
- Current client IndexedDB CV persistence is not cross-device sync.
- The Stripe event ledger is an idempotency guard, not a substitute for a reconciliation job. Add scheduled reconciliation and verify out-of-order subscription events before scaling paid billing.
- Sentry is already initialized from `VITE_SENTRY_DSN`; verify it is set for production and that errors route to the correct organization. No Sentry organization configuration is changed by this PR.

## Vercel Hobby function packaging

Vercel's standalone API mode deploys each JavaScript module in `api/` as a function, including tests and internal helpers. This change moves the seven test modules into `tests/`, shared analyzers into `server/shared/`, and consolidates contact/reply/health endpoints behind a shared dispatcher with original URL rewrites. The resulting `api/` folder has **12 runtime function entries**, matching Vercel's documented Hobby limit. Do not move tests or helper modules back under `api/`.

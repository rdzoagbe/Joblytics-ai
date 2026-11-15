# Joblytics AI — Stabilization release runbook (November 2026)

This change targets the existing **Vercel** application, existing **Supabase Joblytics** project, and existing **Sentry** organization. No hosting migration is needed.

## Scope

- Atomic monthly ATS quotas: Free 3, Starter 40, Pro 200 per UTC calendar month.
- Cached same-job/same-CV results are returned without a new quota reservation.
- Admin exemption: explicit server-side `ADMIN_USER_IDS` or `RATE_LIMIT_WHITELIST` **user IDs only**. Never trust client plan metadata.
- Concurrent analyses reserve capacity before calling Anthropic. Failed processing or a failed analysis save releases the reservation. Abandoned reservations expire after ten minutes. Legacy `analysis` successes in the current UTC month count, so release does not reset an existing user's allowance.
- Stripe signature timestamp limited to five minutes. Database-backed event claims use ownership tokens, abandoned-claim recovery and safe retries. Subscription writes use an atomic per-user event cursor and subscription creation time; the handler fetches the latest Stripe subscription state.
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
select stripe_event_created, stripe_subscription_created from public.subscriptions limit 0;
select proname, proacl from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where nspname = 'public' and proname in ('reserve_ats_analysis','complete_ats_analysis',
                'claim_stripe_webhook_event','complete_stripe_webhook_event',
                'apply_stripe_subscription_state');
```

6. Confirm Vercel environment variables for the **correct deployment environment**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, and the existing client `VITE_*` variables. Never paste secret values into a PR or chat.
7. Deploy a Vercel preview and run `npm test` and `npm run build`.
8. Check signed-in analysis for a Free user, a paid user, and an exempt admin; verify quota errors, cache hits, failed saves, and existing-month usage preservation. Simulate **test-mode** Stripe retries, invalid signatures, stale timestamps, conflicting updates, a missing-user association, an abandoned event claim, and a late cancellation of a superseded subscription.
9. Review Sentry error trends and Vercel function logs; confirm there are no new quota RPC errors.
10. Only then merge and deploy to Vercel production. Monitor errors and billing/usage counts closely.

**Important:** Preview deployment connected to the same live Supabase project still uses live tables. Prefer a non-production Supabase project and Stripe test mode for preview. Do not run chargeable or destructive tests against real users.

## Explicitly deferred

- Legal notice and privacy policy need verified publisher/business details, data-retention decisions, and legal review before full paid launch.
- Smart Sync automatic status changes require company + role disambiguation and user confirmation for ambiguous matches.
- Chrome extension's broad host permissions need separate privacy/security review.
- Current client IndexedDB CV persistence is not cross-device sync.
- The Stripe event ledger and current-state fetch mitigate replay/out-of-order updates but do not guarantee reconciliation if Stripe never delivers an event. Add a scheduled reconciliation job and admin exception queue before scaling paid billing.
- Sentry is already initialized from `VITE_SENTRY_DSN`; verify it is set for production and that errors route to the correct organization. No Sentry organization configuration is changed by this PR.

## Vercel Hobby function packaging

Vercel's standalone API mode deploys each JavaScript module in `api/` as a function, including tests and internal helpers. This change moves the seven test modules into `tests/`, shared analyzers into `server/shared/`, and consolidates contact/reply/health endpoints behind a shared dispatcher with original URL rewrites. The resulting `api/` folder has **12 runtime function entries**, matching Vercel's documented Hobby limit. Do not move tests or helper modules back under `api/`.

## Migration review notes — do not apply automatically

The reviewed Supabase project is **Joblytics** (`rzpvnktdjxkmxowxnqhg`). Do not confuse it with other connected Supabase projects. This PR only edits GitHub.

- **ATS SQL**: adds two service-role-only RPC functions, a restrictive RLS policy that prevents authenticated clients from forging `ats_analysis` events, and an index. Existing `usage_events` records are preserved and current-month `analysis` successes count toward the new limit.
- **Stripe SQL**: adds an RLS-protected event ledger, two service-role claim/complete RPCs, and a service-role atomic subscription-update RPC. It adds `stripe_event_created` and `stripe_subscription_created` columns (default 0) to the existing `subscriptions` table. No existing subscription values are deleted.
- **Recovery**: failed Stripe events remain in the ledger as `failed` and can be reclaimed; `processing` claims become reclaimable after 10 minutes. A claim token prevents late workers from finalizing a reclaimed event.
- **Subscription supersession**: an old subscription's delayed cancellation must not supersede a newer subscription, even if the event itself was created later. DB writes use both the subscription creation time and event time. The server checks current Stripe state and only trusts configured Stripe price IDs.
- **Outstanding**: integration tests must be run in an isolated Supabase project and **Stripe test mode** before deploying, including mock race conditions and the existing API paths. CI exercises JavaScript behavior, **not** live PostgreSQL RPC execution.
- **Do not merge this PR until both SQL migrations are installed, privilege checks pass and an authenticated preview smoke test succeeds.** The new API fails closed if its RPCs are missing.
- No automatic cleanup is configured for `stripe_webhook_events`. Retention policy and independent subscription reconciliation are operational follow-ups.

### Read-only preflight checks (against a non-production copy when possible)

```sql
select action, status, count(*) from public.usage_events
group by action, status order by action, status;
select count(*) as subscription_rows from public.subscriptions;
select tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public'
and tablename in ('usage_events','subscriptions','stripe_webhook_events');
```

## Validation environment blocker — 2026-11-15

The Joblytics Supabase organization currently has two active free projects. Attempts to create an isolated **development branch** were rejected because branching requires the Pro plan. An isolated **free test project** was also rejected because the account is already at its two-project quota. **No branch or project was created, no production SQL was executed, and no existing project was paused/deleted.**

The latest GitHub CI and Vercel preview builds passed, but **those checks do not validate PostgreSQL RPC behavior**. Consequently the two SQL migrations remain **NOT PRODUCTION APPROVED**.

Safe paths forward:
1. Run an isolated PostgreSQL + Supabase Auth/RLS test environment locally, or
2. Provide a separate Supabase test environment with spare capacity, or
3. If needed later, explicitly approve a paid Supabase plan or temporary paid project based on a fresh price quote.

Never repurpose `RD-Clients` or run test reservations/webhooks against the production `Joblytics` database without specific authorization and a restore plan.

Release acceptance criteria before merging:
- SQL migrations apply cleanly on a full compatible schema; functions callable only by `service_role`.
- Client cannot forge quota events; parallel reservations cannot exceed monthly cap; legacy usage correctly included; failures release reservations.
- Stripe duplicates return acknowledged without reprocessing; stale claims can be reclaimed but not finalized by the previous worker; older events and superseded subscriptions cannot downgrade a newer entitlement; unresolved customers stay retryable.
- Staged authenticated API and Stripe test-mode end-to-end checks pass. Smoke-test the analyzer with both language CV PDFs before production deployment.

## PostgreSQL 17 integration test — validated without Supabase charges

A dedicated GitHub Actions workflow (`.github/workflows/postgres-integration.yml`) starts a disposable PostgreSQL 17 service with a compatible synthetic subset of the Supabase schema. It applies both **exact PR migration files**, then executes `tests/sql/migration_integration.sql` to verify quota accounting, restricted role permissions, Stripe claim ownership/retry, stale events, and replacement subscription cancellation protection.

**Validation 2026-11-15:** Both migration files applied successfully and the PostgreSQL integration assertions passed in GitHub Actions (run `43746727673`). Existing JavaScript CI also passed (run `43746727561`).

This is meaningful SQL execution validation, but **not** a full Supabase Auth/API integration test or a Stripe live/test-mode webhooks integration test. Continue to require a controlled staging smoke test and a backup/rollback plan before production deployment.

No live Supabase schema or data changes were made; no temporary Supabase branch or project exists; do not upgrade a paid plan solely for these repository SQL tests.

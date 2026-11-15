import test from 'node:test'
import assert from 'node:assert/strict'
import { reserveAtsQuota, completeAtsQuota, isQuotaExempt } from '../api/analyze-accurate.js'

function mockSupabase(result, error = null) {
  const calls = []
  return {
    calls,
    rpc(method, params) { calls.push({ method, params }); return Promise.resolve({ data: result, error }) }
  }
}

test('atomic reservation returns plan usage and event id', async () => {
  const sb = mockSupabase({ allowed: true, event_id: 'test-event', plan: 'free', used: 1, limit: 3, remaining: 2 })
  const result = await reserveAtsQuota(sb, 'user-1')
  assert.equal(result.event_id, 'test-event')
  assert.deepEqual(sb.calls, [{ method: 'reserve_ats_analysis', params: { p_user_id: 'user-1' } }])
})

test('exhausted quota blocks processing before the AI call', async () => {
  const sb = mockSupabase({ allowed: false, plan: 'starter', used: 40, limit: 40, remaining: 0 })
  await assert.rejects(reserveAtsQuota(sb, 'user-1'), err => err.statusCode === 429 && err.code === 'PLAN_LIMIT_REACHED')
})

test('missing quota backend fails closed', async () => {
  await assert.rejects(reserveAtsQuota(null, 'user-1'), err => err.statusCode === 503 && err.code === 'QUOTA_SERVICE_UNAVAILABLE')
})

test('database reservation failures never silently grant free AI calls', async () => {
  const sb = mockSupabase(null, { message: 'RPC missing' })
  await assert.rejects(reserveAtsQuota(sb, 'user-1'), err => err.statusCode === 503 && err.code === 'QUOTA_SERVICE_UNAVAILABLE')
})

test('reservation completion records successful work', async () => {
  const sb = mockSupabase(true)
  await completeAtsQuota(sb, 'test-event', 'user-1', true)
  assert.deepEqual(sb.calls, [{ method: 'complete_ats_analysis', params: { p_event_id: 'test-event', p_user_id: 'user-1', p_succeeded: true } }])
})

test('admin exemption matches user ID rather than client metadata', () => {
  const old = process.env.ADMIN_USER_IDS
  const oldWhitelist = process.env.RATE_LIMIT_WHITELIST
  process.env.ADMIN_USER_IDS = 'admin-uuid,another-id'
  delete process.env.RATE_LIMIT_WHITELIST
  try {
    assert.equal(isQuotaExempt('admin-uuid'), true)
    assert.equal(isQuotaExempt('visitor-id'), false)
  } finally {
    if (old === undefined) delete process.env.ADMIN_USER_IDS
    else process.env.ADMIN_USER_IDS = old
    if (oldWhitelist === undefined) delete process.env.RATE_LIMIT_WHITELIST
    else process.env.RATE_LIMIT_WHITELIST = oldWhitelist
  }
})

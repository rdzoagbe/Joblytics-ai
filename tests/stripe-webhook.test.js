import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import handler, { claimStripeEvent, completeStripeEvent, updateUserSubscription } from '../api/stripe-webhook.js'

function request(payload, signature) {
  const req = Readable.from([Buffer.from(JSON.stringify(payload))])
  req.method = 'POST'
  req.headers = { 'stripe-signature': signature }
  return req
}

async function respond(payload, signature) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this }
  }
  await handler(request(payload, signature), res)
  return res
}

function sign(payload, secret, at) {
  const body = JSON.stringify(payload)
  const signed = crypto.createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')
  return `t=${at},v1=${signed}`
}

test('Stripe rejects expired correctly signed events', async () => {
  const old = process.env.STRIPE_WEBHOOK_SECRET
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_for_stabilization'
  try {
    const payload = { id: 'evt_expired', type: 'ping', data: { object: {} } }
    const t = Math.floor(Date.now() / 1000) - 3600
    const res = await respond(payload, sign(payload, process.env.STRIPE_WEBHOOK_SECRET, t))
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.code, 'STRIPE_TIMESTAMP_EXPIRED')
  } finally {
    if (old === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
    else process.env.STRIPE_WEBHOOK_SECRET = old
  }
})

test('Stripe rejects tampered signatures even within tolerance', async () => {
  const old = process.env.STRIPE_WEBHOOK_SECRET
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_for_stabilization'
  try {
    const payload = { id: 'evt_invalid', type: 'ping', data: { object: {} } }
    const signature = sign({ ...payload, id: 'different' }, process.env.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000))
    const res = await respond(payload, signature)
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.code, 'INVALID_STRIPE_SIGNATURE')
  } finally {
    if (old === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
    else process.env.STRIPE_WEBHOOK_SECRET = old
  }
})

test('Stripe rejects malformed signature header', async () => {
  const old = process.env.STRIPE_WEBHOOK_SECRET
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_for_stabilization'
  try {
    const res = await respond({ id: 'evt_missing' }, '')
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.code, 'INVALID_STRIPE_SIGNATURE_HEADER')
  } finally {
    if (old === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
    else process.env.STRIPE_WEBHOOK_SECRET = old
  }
})

test('processed Stripe event is acknowledged without duplicate handling', async () => {
  const sb = { rpc: async () => ({ data: { state: 'processed' }, error: null }) }
  assert.deepEqual(await claimStripeEvent(sb, 'evt_processed'), { state: 'processed' })
})

test('in-progress Stripe event requests a retry', async () => {
  const sb = { rpc: async () => ({ data: { state: 'busy' }, error: null }) }
  await assert.rejects(claimStripeEvent(sb, 'evt_busy'), e =>
    e.statusCode === 503 && e.code === 'STRIPE_EVENT_IN_PROGRESS')
})

test('recovered claim returns ownership token used for completion', async () => {
  const calls = []
  const sb = {
    async rpc(method, params) {
      calls.push({ method, params })
      return method === 'claim_stripe_webhook_event'
        ? { data: { state: 'claimed', token: 'test-token' }, error: null }
        : { data: true, error: null }
    }
  }
  const claimed = await claimStripeEvent(sb, 'evt_recovered')
  assert.equal(claimed.token, 'test-token')
  await completeStripeEvent(sb, 'evt_recovered', claimed.token, false)
  assert.deepEqual(calls[1], {
    method: 'complete_stripe_webhook_event',
    params: { p_event_id: 'evt_recovered', p_claim_token: 'test-token', p_succeeded: false }
  })
})

test('unresolved Stripe owner fails instead of acknowledging a lost subscription', async () => {
  const sb = { auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } } }
  await assert.rejects(updateUserSubscription({
    supabase: sb,
    userId: 'missing-user',
    eventCreated: 1794750000,
    subscription: { id: 'sub_test', status: 'active', items: { data: [{ price: { id: process.env.STRIPE_PLUS_PRICE_ID || process.env.STRIPE_STARTER_PRICE_ID || 'price_1TM5bZ0E2aOc1laPuYuKWqZb' } }] } }
  }), e => e.statusCode === 503 && e.code === 'STRIPE_USER_NOT_FOUND')
})

test('stale subscription events cannot update display metadata', async () => {
  let metadataUpdated = false
  const sb = {
    auth: { admin: {
      getUserById: async () => ({ data: { user: { user_metadata: {} } }, error: null }),
      updateUserById: async () => { metadataUpdated = true; return { error: null } }
    } },
    rpc: async (method, params) => ({
      data: { applied: false, reason: 'older_event' }, error: null
    })
  }
  const result = await updateUserSubscription({
    supabase: sb, userId: 'user-1', eventCreated: 1794750000,
    subscription: { id: 'sub_test', status: 'active', items: { data: [{ price: { id: process.env.STRIPE_PLUS_PRICE_ID || process.env.STRIPE_STARTER_PRICE_ID || 'price_1TM5bZ0E2aOc1laPuYuKWqZb' } }] } }
  })
  assert.equal(result.reason, 'older_event')
  assert.equal(metadataUpdated, false)
})

test('Stripe sync sends subscription ID and creation time to guarded DB write', async () => {
  let rpcArgs = null
  const sb = {
    auth: { admin: {
      getUserById: async () => ({ data: { user: { user_metadata: {} } }, error: null }),
      updateUserById: async () => ({ error: null })
    } },
    rpc: async (method, args) => {
      rpcArgs = { method, args }
      return { data: { applied: true }, error: null }
    }
  }
  const subscription = {
    id: 'sub_newer', created: 1794800000, status: 'active', customer: 'cus_test',
    items: { data: [{ price: { id: process.env.STRIPE_PLUS_PRICE_ID || process.env.STRIPE_STARTER_PRICE_ID || 'price_1TM5bZ0E2aOc1laPuYuKWqZb' } }] }
  }
  const result = await updateUserSubscription({
    supabase: sb, userId: 'user-1', subscription, eventCreated: 1794800100
  })
  assert.equal(result.updated, true)
  assert.equal(rpcArgs.method, 'apply_stripe_subscription_state')
  assert.equal(rpcArgs.args.p_event_created, 1794800100)
  assert.equal(rpcArgs.args.p_state.stripe_subscription_id, 'sub_newer')
  assert.equal(rpcArgs.args.p_state.stripe_subscription_created, 1794800000)
})

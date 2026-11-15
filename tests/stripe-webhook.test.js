import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import handler from '../api/stripe-webhook.js'

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

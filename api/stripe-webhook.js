import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const PRICE_TO_PLAN = {
  [process.env.STRIPE_PLUS_PRICE_ID || process.env.STRIPE_STARTER_PRICE_ID || 'price_1TM5bZ0E2aOc1laPuYuKWqZb']: 'starter',
  [process.env.STRIPE_PRO_PRICE_ID || 'price_1TM5dJ0E2aOc1laPtsjFFjac']: 'pro'
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
}

function getSupabaseServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
}

function createAdminSupabaseClient() {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceKey()
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function verifyStripeSignature(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    const err = new Error('Stripe webhook secret is not configured.')
    err.statusCode = 500
    err.code = 'STRIPE_WEBHOOK_SECRET_MISSING'
    throw err
  }

  const parts = String(signatureHeader || '').split(',').reduce((acc, part) => {
    const [key, value] = part.split('=')
    if (!acc[key]) acc[key] = []
    acc[key].push(value)
    return acc
  }, {})

  const timestamp = parts.t?.[0]
  const signatures = parts.v1 || []
  if (!timestamp || !signatures.length) {
    const err = new Error('Invalid Stripe signature header.')
    err.statusCode = 400
    err.code = 'INVALID_STRIPE_SIGNATURE_HEADER'
    throw err
  }

  // Stripe recommends rejecting stale signed events to prevent replay attacks.
  const signedAt = Number(timestamp)
  if (!Number.isSafeInteger(signedAt) || Math.abs(Math.floor(Date.now() / 1000) - signedAt) > 300) {
    const err = new Error('Stripe webhook timestamp is outside the five-minute tolerance.')
    err.statusCode = 400
    err.code = 'STRIPE_TIMESTAMP_EXPIRED'
    throw err
  }

  const payload = `${timestamp}.${rawBody.toString('utf8')}`
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const valid = signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    } catch {
      return false
    }
  })

  if (!valid) {
    const err = new Error('Stripe webhook signature verification failed.')
    err.statusCode = 400
    err.code = 'INVALID_STRIPE_SIGNATURE'
    throw err
  }
}

function planFromSubscription(subscription) {
  const priceId = subscription?.items?.data?.[0]?.price?.id
  // Never trust Stripe metadata to grant paid access: price IDs must be configured on server.
  const plan = PRICE_TO_PLAN[priceId]
  if (!plan) {
    const err = new Error('Unrecognized Stripe price ID; configure the plan mapping before processing.')
    err.code = 'STRIPE_PRICE_NOT_MAPPED'
    err.statusCode = 503
    throw err
  }
  return plan
}

function subscriptionPayload({ subscription }) {
  const mappedPlan = planFromSubscription(subscription)
  const plan = subscription?.status === 'canceled' ? 'free' : mappedPlan
  return {
    subscription_plan: plan,
    plan,
    subscription_status: subscription?.status || 'unknown',
    stripe_subscription_status: subscription?.status || 'unknown',
    stripe_customer_id: typeof subscription?.customer === 'string' ? subscription.customer : subscription?.customer?.id || null,
    stripe_subscription_id: subscription?.id || null,
    stripe_price_id: subscription?.items?.data?.[0]?.price?.id || null,
    stripe_product_id: subscription?.items?.data?.[0]?.price?.product || null,
    current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    subscription_updated_at: new Date().toISOString()
  }
}

export async function updateUserSubscription({ supabase, userId, subscription, eventCreated }) {
  if (!supabase) throw new Error('Supabase service role is not configured.')
  if (!userId) {
    const err = new Error('Stripe subscription cannot be linked to a Joblytics user.')
    err.statusCode = 503
    err.code = 'STRIPE_USER_ID_MISSING'
    throw err
  }
  if (!subscription?.id) throw new Error('Stripe subscription ID missing.')
  const payload = subscriptionPayload({ subscription })
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(userId)
  if (getError || !existing?.user) {
    const err = new Error('The Stripe subscription owner could not be verified.')
    err.statusCode = 503
    err.code = 'STRIPE_USER_NOT_FOUND'
    throw err
  }

  const { data: applied, error: applyError } = await supabase.rpc('apply_stripe_subscription_state', {
    p_user_id: userId,
    p_event_created: eventCreated,
    p_state: {
      plan: payload.plan,
      status: payload.subscription_status,
      stripe_customer_id: payload.stripe_customer_id,
      stripe_subscription_id: payload.stripe_subscription_id,
      stripe_subscription_created: subscription.created,
      stripe_price_id: payload.stripe_price_id,
      stripe_product_id: payload.stripe_product_id,
      current_period_end: payload.current_period_end
    }
  })
  if (applyError || !applied) throw applyError || new Error('Subscription transaction failed.')
  if (!applied.applied) return { skipped: true, reason: applied.reason || 'older_event' }

  // This metadata mirror is display-only. A failure must not make a correctly applied
  // authoritative DB subscription appear unprocessed and trigger unnecessary retries.
  const current = existing.user.user_metadata || {}
  const { error: metadataError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { ...current, ...payload }
  })
  if (metadataError) console.warn('[STRIPE] metadata display mirror failed:', metadataError.message)
  return { updated: true, userId, plan: payload.plan, status: payload.subscription_status }
}

async function getSubscription(subscriptionId, { allowDeletedFallback = false, fallback = null } = {}) {
  if (!/^sub_[a-zA-Z0-9_]+$/.test(String(subscriptionId || ''))) {
    throw new Error('Invalid Stripe subscription reference.')
  }
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
  })
  const data = await response.json().catch(() => ({}))
  // After a deleted event, Stripe may no longer return the subscription. In that
  // case only, use the signed event's deleted status and its original price details.
  if (response.status === 404 && allowDeletedFallback && fallback?.id === subscriptionId) {
    return { ...fallback, status: 'canceled' }
  }
  if (!response.ok) throw new Error(data?.error?.message || 'Could not retrieve Stripe subscription.')
  return data
}

export async function claimStripeEvent(supabase, eventId) {
  if (!supabase || !eventId) throw new Error('Stripe event ledger is unavailable.')
  const { data, error } = await supabase.rpc('claim_stripe_webhook_event', { p_event_id: eventId })
  if (error || !data) throw error || new Error('Unable to claim Stripe event.')
  if (data.state === 'processed') return { state: 'processed' }
  if (data.state === 'busy') {
    const err = new Error('Stripe event is already being processed; retry later.')
    err.statusCode = 503
    err.code = 'STRIPE_EVENT_IN_PROGRESS'
    throw err
  }
  if (data.state !== 'claimed' || !data.token) throw new Error('Unexpected Stripe event claim response.')
  return { state: 'claimed', token: data.token }
}

export async function completeStripeEvent(supabase, eventId, token, succeeded) {
  const { data, error } = await supabase.rpc('complete_stripe_webhook_event', {
    p_event_id: eventId, p_claim_token: token, p_succeeded: succeeded
  })
  if (error || data !== true) throw error || new Error('Stripe event claim was lost before completion.')
}


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let claim = null
  let supabase = null
  let eventId = null
  try {
    const rawBody = await readRawBody(req)
    verifyStripeSignature(rawBody, req.headers['stripe-signature'])
    const event = JSON.parse(rawBody.toString('utf8'))
    if (!/^evt_[a-zA-Z0-9_]+$/.test(String(event?.id || ''))
      || !Number.isSafeInteger(event.created) || event.created <= 0) {
      const err = new Error('Invalid Stripe event payload.')
      err.statusCode = 400
      err.code = 'INVALID_STRIPE_EVENT'
      throw err
    }

    supabase = createAdminSupabaseClient()
    if (!supabase) throw new Error('Stripe webhook storage is not configured.')
    eventId = event.id
    claim = await claimStripeEvent(supabase, event.id)
    if (claim.state === 'processed') return res.status(200).json({ received: true, duplicate: true })

    let result = { ignored: true }
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object || {}
      if (session.mode === 'subscription' && session.subscription) {
        const subscription = await getSubscription(session.subscription)
        const userId = session.client_reference_id || session.metadata?.user_id || subscription.metadata?.user_id
        if (session.client_reference_id && subscription.metadata?.user_id &&
            session.client_reference_id !== subscription.metadata.user_id) {
          const err = new Error('Stripe checkout user ID differs from subscription metadata.')
          err.code = 'STRIPE_IDENTITY_MISMATCH'
          throw err
        }
        result = await updateUserSubscription({ supabase, userId, subscription, eventCreated: event.created })
      }
    }
    if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
      const signedSubscription = event.data?.object || {}
      const subscription = await getSubscription(signedSubscription.id, {
        allowDeletedFallback: event.type === 'customer.subscription.deleted',
        fallback: signedSubscription
      })
      const userId = subscription.metadata?.user_id || signedSubscription.metadata?.user_id
      result = await updateUserSubscription({ supabase, userId, subscription, eventCreated: event.created })
    }

    await completeStripeEvent(supabase, event.id, claim.token, true)
    claim = null
    return res.status(200).json({ received: true, type: event.type, result })
  } catch (e) {
    if (claim?.token && supabase && eventId) {
      try { await completeStripeEvent(supabase, eventId, claim.token, false) }
      catch (releaseError) { console.error('[STRIPE] failed to release event claim:', releaseError.message) }
    }
    console.error('Stripe webhook error:', e)
    return res.status(e.statusCode || 500).json({ error: e.message || 'Webhook failed', code: e.code || 'STRIPE_WEBHOOK_FAILED' })
  }
}

export const config = {
  api: {
    bodyParser: false
  }
}

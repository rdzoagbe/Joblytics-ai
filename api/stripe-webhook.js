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
  return PRICE_TO_PLAN[priceId] || subscription?.metadata?.plan_id || 'free'
}

function subscriptionPayload({ subscription, statusOverride }) {
  const plan = statusOverride === 'canceled' ? 'free' : planFromSubscription(subscription)
  return {
    subscription_plan: plan,
    plan,
    subscription_status: statusOverride || subscription?.status || 'unknown',
    stripe_subscription_status: statusOverride || subscription?.status || 'unknown',
    stripe_customer_id: typeof subscription?.customer === 'string' ? subscription.customer : subscription?.customer?.id || null,
    stripe_subscription_id: subscription?.id || null,
    stripe_price_id: subscription?.items?.data?.[0]?.price?.id || null,
    stripe_product_id: subscription?.items?.data?.[0]?.price?.product || null,
    current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    subscription_updated_at: new Date().toISOString()
  }
}

async function updateUserSubscription({ supabase, userId, subscription, statusOverride }) {
  if (!supabase) throw new Error('Supabase service role is not configured.')
  if (!userId) return { skipped: true, reason: 'missing_user_id' }

  const payload = subscriptionPayload({ subscription, statusOverride })
  const { data: existing, error: getError } = await supabase.auth.admin.getUserById(userId)
  if (getError || !existing?.user) return { skipped: true, reason: getError?.message || 'user_not_found' }

  // Authoritative entitlement: write to the server-only subscriptions table (RLS-protected,
  // not user-writable). This is what the API endpoints read to gate paid features.
  const { error: subError } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    plan: payload.plan,
    status: payload.subscription_status,
    stripe_customer_id: payload.stripe_customer_id,
    stripe_subscription_id: payload.stripe_subscription_id,
    stripe_price_id: payload.stripe_price_id,
    stripe_product_id: payload.stripe_product_id,
    current_period_end: payload.current_period_end,
    updated_at: payload.subscription_updated_at
  }, { onConflict: 'user_id' })
  if (subError) throw subError

  // Also mirror into user_metadata for display/back-compat only — NEVER trusted for gating.
  const current = existing.user.user_metadata || {}
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { ...current, ...payload }
  })

  if (error) throw error
  return { updated: true, userId, plan: payload.plan, status: payload.subscription_status }
}

async function getSubscription(subscriptionId) {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error?.message || 'Could not retrieve Stripe subscription.')
  return data
}


async function claimStripeEvent(supabase, eventId) {
  if (!supabase || !eventId) throw new Error('Stripe event ledger is unavailable.')
  const { data, error } = await supabase.from('stripe_webhook_events')
    .upsert({ event_id: eventId, status: 'processing' }, { onConflict: 'event_id', ignoreDuplicates: true })
    .select('event_id')
  if (error) throw error
  if (data?.length) return 'claimed'

  const { data: existing, error: readError } = await supabase.from('stripe_webhook_events')
    .select('status, claimed_at').eq('event_id', eventId).single()
  if (readError) throw readError
  if (existing.status === 'processed') return 'processed'
  // A simultaneous worker may still be processing; return 503 so Stripe retries.
  const err = new Error('Webhook event is already being processed.')
  err.statusCode = 503
  err.code = 'STRIPE_EVENT_IN_PROGRESS'
  throw err
}

async function markStripeEventProcessed(supabase, eventId) {
  const { error } = await supabase.from('stripe_webhook_events').update({
    status: 'processed', processed_at: new Date().toISOString()
  }).eq('event_id', eventId).eq('status', 'processing')
  if (error) throw error
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let claimedEventId = null
  let eventClient = null
  try {
    const rawBody = await readRawBody(req)
    verifyStripeSignature(rawBody, req.headers['stripe-signature'])
    const event = JSON.parse(rawBody.toString('utf8'))
    const supabase = createAdminSupabaseClient()
    if (!supabase) throw new Error('Stripe webhook storage is not configured.')
    const claim = await claimStripeEvent(supabase, event.id)
    if (claim === 'processed') return res.status(200).json({ received: true, duplicate: true })
    claimedEventId = event.id
    eventClient = supabase

    let result = { ignored: true }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const subscriptionId = session.subscription
      const subscription = subscriptionId ? await getSubscription(subscriptionId) : null
      const userId = session.client_reference_id || session.metadata?.user_id || subscription?.metadata?.user_id
      if (subscription) result = await updateUserSubscription({ supabase, userId, subscription })
    }

    if (['customer.subscription.created', 'customer.subscription.updated'].includes(event.type)) {
      const subscription = event.data.object
      const userId = subscription.metadata?.user_id
      result = await updateUserSubscription({ supabase, userId, subscription })
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object
      const userId = subscription.metadata?.user_id
      result = await updateUserSubscription({ supabase, userId, subscription, statusOverride: 'canceled' })
    }

    await markStripeEventProcessed(supabase, event.id)
    claimedEventId = null
    return res.status(200).json({ received: true, type: event.type, result })
  } catch (e) {
    if (claimedEventId && eventClient) {
      // Release failed claims, allowing Stripe's automatic retries to reprocess the event.
      const { error: releaseError } = await eventClient.from('stripe_webhook_events')
        .delete().eq('event_id', claimedEventId).eq('status', 'processing')
      if (releaseError) console.error('Stripe webhook claim release failed:', releaseError.message)
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

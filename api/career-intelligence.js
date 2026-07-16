import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Sonnet generation up to ~3200 tokens can exceed Vercel's default 10s timeout and 504
// (a killed request still costs tokens). Give the function the full budget.
export const config = { maxDuration: 60 }

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PLAN_LIMITS = {
  free: { id: 'free', label: 'Free', monthly: { career_intelligence: 1 } },
  starter: { id: 'starter', label: 'Starter', monthly: { career_intelligence: 10 } },
  pro: { id: 'pro', label: 'Pro', monthly: { career_intelligence: 60 } }
}

const SYSTEM = `You are Joblytics AI Career Intelligence Engine, a senior executive recruiter, compensation strategist and career coach for France and Europe.
Analyze only the evidence supplied by the user. Do not invent employers, titles, degrees, certifications, numbers or achievements.
If evidence is missing, say what should be added.
Return ONLY valid JSON with this exact structure:
{
  "career_score": 0-100,
  "career_level": "current level in 3-8 words",
  "market_position": "one concise market-position statement",
  "executive_summary": "4-6 sentence strategic career summary",
  "salary_intelligence": {
    "france": "range or evidence-limited estimate",
    "uk": "range or evidence-limited estimate",
    "switzerland": "range or evidence-limited estimate",
    "note": "one sentence explaining uncertainty"
  },
  "recruiter_view": {
    "shortlist_probability": 0-100,
    "why_shortlisted": ["max 5 reasons"],
    "why_rejected": ["max 5 risks or objections"],
    "best_fit_roles": ["max 8 role titles"]
  },
  "gap_analysis": {
    "target_role": "target role used",
    "missing_skills": ["max 10"],
    "missing_evidence": ["max 8"],
    "positioning_gaps": ["max 8"]
  },
  "roadmap": {
    "next_30_days": ["max 5 practical actions"],
    "next_90_days": ["max 5 practical actions"],
    "next_12_months": ["max 5 strategic actions"]
  },
  "application_strategy": {
    "apply_now": ["max 5 job types to prioritize"],
    "avoid_for_now": ["max 5 job types to avoid"],
    "message_angle": "copy-ready 2-3 sentence positioning angle"
  },
  "warnings": ["max 5 evidence or data warnings"]
}`

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function safeArray(value, limit = 8) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean).slice(0, limit) : []
}

function clampScore(value) {
  const score = Math.round(Number(value))
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
}

function getSupabaseKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

function createServerSupabaseClient() {
  const url = getSupabaseUrl()
  const key = getSupabaseKey()
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || ''
  if (!header || typeof header !== 'string') return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

async function requireUser(req, supabase) {
  const token = getBearerToken(req)
  if (!token) {
    const err = new Error('Your sign-in token was not sent to the server. Refresh the page and try again.')
    err.statusCode = 401
    err.code = 'AUTH_TOKEN_MISSING'
    throw err
  }
  if (!supabase) {
    const err = new Error('Career Intelligence authentication is not configured on the server. Check Supabase environment variables in Vercel.')
    err.statusCode = 500
    err.code = 'SUPABASE_AUTH_CONFIG_MISSING'
    throw err
  }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    const err = new Error('Your session could not be verified. Please refresh the page or sign in again.')
    err.statusCode = 401
    err.code = 'INVALID_SESSION'
    throw err
  }
  return data.user
}

function normalizePlan(value) {
  const plan = String(value || '').toLowerCase().trim()
  if (['pro', 'premium', 'professional'].includes(plan)) return 'pro'
  if (['starter', 'tier', 'plus', 'basic', 'paid'].includes(plan)) return 'starter'
  return 'free'
}

// Entitlement is read from the server-only `subscriptions` table (written exclusively by
// the Stripe webhook). We do NOT trust user_metadata/app_metadata here: user_metadata is
// editable by the user themselves, so trusting it let anyone self-grant Pro.
async function resolveUserPlan(supabase, user) {
  const adminIds = (process.env.RATE_LIMIT_WHITELIST || process.env.ADMIN_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean)
  if (adminIds.includes(user?.id)) return PLAN_LIMITS.pro
  if (!supabase || !user?.id) return PLAN_LIMITS.free
  try {
    const { data } = await supabase.from('subscriptions').select('plan, status, current_period_end').eq('user_id', user.id).maybeSingle()
    if (!data) return PLAN_LIMITS.free
    const status = String(data.status || '').toLowerCase()
    const planId = normalizePlan(data.plan)
    const notExpired = !data.current_period_end || new Date(data.current_period_end).getTime() > Date.now()
    if (planId !== 'free' && ['active', 'trialing', 'paid'].includes(status) && notExpired) return PLAN_LIMITS[planId]
  } catch (e) {
    console.error('resolveUserPlan lookup failed:', e?.message)
  }
  return PLAN_LIMITS.free
}

function startOfMonthIso() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)).toISOString()
}

function hash(value) {
  if (!value) return null
  const salt = process.env.USAGE_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'joblytics'
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex')
}

function getRequestIdentity(req) {
  const forwarded = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''
  const ip = String(forwarded).split(',')[0].trim()
  const userAgent = req.headers['user-agent'] || ''
  const deviceId = String(req.headers['x-joblytics-device-id'] || '').slice(0, 120)
  return { deviceId, ipHash: hash(ip), userAgentHash: hash(userAgent) }
}

async function checkUsageLimit({ supabase, req, user, eventType }) {
  const plan = await resolveUserPlan(supabase, user)
  const limit = plan.monthly[eventType] ?? 0
  const identity = getRequestIdentity(req)
  const since = startOfMonthIso()
  let used = 0
  let source = 'fallback'

  try {
    const filters = [`user_id.eq.${user.id}`]
    if (identity.deviceId) filters.push(`device_id.eq.${identity.deviceId}`)
    if (identity.ipHash) filters.push(`ip_hash.eq.${identity.ipHash}`)

    const { count, error } = await supabase
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', eventType)
      .gte('created_at', since)
      .or(filters.join(','))

    if (!error) {
      used = count || 0
      source = 'usage_events'
    }
  } catch {}

  if (used >= limit) {
    const err = new Error(`${plan.label} limit reached: ${limit} career intelligence report${limit === 1 ? '' : 's'} per month. Upgrade to continue.`)
    err.statusCode = 429
    err.code = 'PLAN_LIMIT_REACHED'
    err.usage = { plan: plan.id, planLabel: plan.label, eventType, used, limit, remaining: 0, source }
    throw err
  }

  return { plan: plan.id, planLabel: plan.label, eventType, used, limit, remaining: Math.max(0, limit - used), source, identity }
}

async function recordUsageEvent({ supabase, user, eventType, usage, meta = {} }) {
  try {
    await supabase
      .from('usage_events')
      .insert({
        user_id: user.id,
        email: user.email || null,
        event_type: eventType,
        plan: usage.plan,
        device_id: usage.identity?.deviceId || null,
        ip_hash: usage.identity?.ipHash || null,
        user_agent_hash: usage.identity?.userAgentHash || null,
        metadata: meta
      })
  } catch {}
}

function publicUsage(usage, increment = 0) {
  if (!usage) return null
  const used = usage.used + increment
  return {
    plan: usage.plan,
    planLabel: usage.planLabel,
    eventType: usage.eventType,
    used,
    limit: usage.limit,
    remaining: Math.max(0, usage.limit - used),
    source: usage.source
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = createServerSupabaseClient()

  try {
    const user = await requireUser(req, supabase)
    const { cvText, linkedinText, profileText, jobDescription, targetRole, targetMarket } = req.body || {}
    const profile = clean([cvText, linkedinText, profileText].filter(Boolean).join('\n\n'))
    const jd = clean(jobDescription)
    const role = clean(targetRole) || 'the user target role'
    const market = clean(targetMarket) || 'France and Europe'

    if (profile.length < 250) {
      return res.status(400).json({
        error: 'Add at least 250 characters from a CV, LinkedIn PDF, or professional profile before generating a Career Intelligence report.',
        code: 'CAREER_PROFILE_TEXT_REQUIRED',
        checklist: [
          'Upload or paste your CV text.',
          'Add LinkedIn profile PDF/text if available.',
          'Add a target role such as Head of IT or IT Operations Manager.',
          'Optionally paste a job description for sharper gap analysis.'
        ]
      })
    }

    const usage = await checkUsageLimit({ supabase, req, user, eventType: 'career_intelligence' })

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3200,
      temperature: 0.2,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `TARGET ROLE:\n${role}\n\nTARGET MARKET:\n${market}\n\nJOB DESCRIPTION, IF PROVIDED:\n${jd || 'Not provided'}\n\nPROFILE EVIDENCE PROVIDED BY USER:\n${profile.slice(0, 14000)}`
      }]
    })

    const raw = (message.content || []).map(block => block.text || '').join('').trim().replace(/```json|```/g, '').trim()
    let result
    try {
      result = JSON.parse(raw)
    } catch (e) {
      console.error('Career intelligence JSON parse failed:', raw.slice(0, 800))
      return res.status(500).json({ error: 'Career Intelligence report failed. Please try again.', code: 'BAD_AI_JSON' })
    }

    await recordUsageEvent({ supabase, user, eventType: 'career_intelligence', usage, meta: { targetRole: role, targetMarket: market, hasJobDescription: Boolean(jd) } })

    return res.status(200).json({
      success: true,
      usage: publicUsage(usage, 1),
      report: {
        career_score: clampScore(result.career_score),
        career_level: clean(result.career_level),
        market_position: clean(result.market_position),
        executive_summary: clean(result.executive_summary),
        salary_intelligence: {
          france: clean(result.salary_intelligence?.france),
          uk: clean(result.salary_intelligence?.uk),
          switzerland: clean(result.salary_intelligence?.switzerland),
          note: clean(result.salary_intelligence?.note)
        },
        recruiter_view: {
          shortlist_probability: clampScore(result.recruiter_view?.shortlist_probability),
          why_shortlisted: safeArray(result.recruiter_view?.why_shortlisted, 5),
          why_rejected: safeArray(result.recruiter_view?.why_rejected, 5),
          best_fit_roles: safeArray(result.recruiter_view?.best_fit_roles, 8)
        },
        gap_analysis: {
          target_role: clean(result.gap_analysis?.target_role) || role,
          missing_skills: safeArray(result.gap_analysis?.missing_skills, 10),
          missing_evidence: safeArray(result.gap_analysis?.missing_evidence, 8),
          positioning_gaps: safeArray(result.gap_analysis?.positioning_gaps, 8)
        },
        roadmap: {
          next_30_days: safeArray(result.roadmap?.next_30_days, 5),
          next_90_days: safeArray(result.roadmap?.next_90_days, 5),
          next_12_months: safeArray(result.roadmap?.next_12_months, 5)
        },
        application_strategy: {
          apply_now: safeArray(result.application_strategy?.apply_now, 5),
          avoid_for_now: safeArray(result.application_strategy?.avoid_for_now, 5),
          message_angle: clean(result.application_strategy?.message_angle)
        },
        warnings: safeArray(result.warnings, 5),
        target_role: role,
        target_market: market,
        generated_at: new Date().toISOString()
      }
    })
  } catch (e) {
    console.error('Career intelligence error:', e.message)
    return res.status(e.statusCode || 500).json({
      error: e.message || 'Career Intelligence report failed',
      code: e.code || 'CAREER_INTELLIGENCE_FAILED',
      usage: e.usage || null
    })
  }
}

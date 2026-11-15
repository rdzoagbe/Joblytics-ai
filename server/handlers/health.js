import { createClient } from '@supabase/supabase-js'

const REQUIRED_VARS = [
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
]

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ status: 'error', error: 'Method not allowed' })

  const checks = {}
  let allOk = true

  // Check required env vars
  const missingVars = REQUIRED_VARS.filter(v => {
    const val = process.env[v]
    return !val || val === 'placeholder'
  })
  checks.env_vars = missingVars.length === 0
    ? { ok: true }
    : { ok: false, missing: missingVars }
  if (!checks.env_vars.ok) allOk = false

  // Check Supabase connectivity
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (supabaseUrl && supabaseKey) {
    try {
      const start = Date.now()
      const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
      const { error } = await supabase.from('analyses').select('id').limit(1)
      checks.supabase = error
        ? { ok: false, error: error.message }
        : { ok: true, latencyMs: Date.now() - start }
    } catch (e) {
      checks.supabase = { ok: false, error: e.message }
    }
    if (!checks.supabase.ok) allOk = false
  } else {
    checks.supabase = { ok: false, error: 'Supabase env vars not set' }
    allOk = false
  }

  // Check Anthropic key is present (can't validate without a real call)
  checks.anthropic = process.env.ANTHROPIC_API_KEY
    ? { ok: true }
    : { ok: false, error: 'ANTHROPIC_API_KEY not set' }
  if (!checks.anthropic.ok) allOk = false

  const status = allOk ? 'ok' : 'degraded'
  return res.status(allOk ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    checks
  })
}

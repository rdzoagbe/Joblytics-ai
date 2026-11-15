import { createClient } from '@supabase/supabase-js'

const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'admin@joblytics-ai.com'
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || 'Joblytics <admin@joblytics-ai.com>'

function clean(value) {
  return String(value || '').trim()
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
}

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
}

function createServerSupabaseClient() {
  const url = getSupabaseUrl()
  const key = getSupabaseKey()
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || ''
  const match = String(header).match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

async function requireUser(req, supabase) {
  const token = getBearerToken(req)
  if (!token) {
    const error = new Error('Please sign in to reply to this conversation.')
    error.statusCode = 401
    error.code = 'AUTH_TOKEN_MISSING'
    throw error
  }
  if (!supabase) {
    const error = new Error('Support messages are not configured on the server.')
    error.statusCode = 500
    error.code = 'SUPABASE_CONFIG_MISSING'
    throw error
  }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    const authError = new Error('Your session could not be verified. Please refresh and try again.')
    authError.statusCode = 401
    authError.code = 'INVALID_SESSION'
    throw authError
  }
  return data.user
}

function buildReplyHtml({ thread, user, message }) {
  const esc = value => clean(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]))
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2>New reply on Joblytics support conversation</h2>
      <p><strong>Subject:</strong> ${esc(thread.subject)}</p>
      <p><strong>Category:</strong> ${esc(thread.category)}</p>
      <p><strong>User:</strong> ${esc(user.email || thread.user_email)}</p>
      <hr />
      <p><strong>Reply</strong></p>
      <p style="white-space:pre-wrap">${esc(message)}</p>
    </div>`
}

async function sendReplyEmail({ thread, user, message }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true, reason: 'RESEND_API_KEY missing' }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: CONTACT_FROM_EMAIL,
      to: [CONTACT_TO_EMAIL],
      reply_to: user.email || thread.user_email || undefined,
      subject: `Re: ${thread.subject || 'Joblytics support request'}`,
      html: buildReplyHtml({ thread, user, message })
    })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.message || data?.error || 'Email provider rejected the reply notification.')
  return data
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const supabase = createServerSupabaseClient()
    const user = await requireUser(req, supabase)
    const { threadId, message } = req.body || {}
    const body = clean(message)

    if (!threadId) return res.status(400).json({ error: 'Conversation ID is required.', code: 'THREAD_REQUIRED' })
    if (body.length < 2) return res.status(400).json({ error: 'Reply cannot be empty.', code: 'MESSAGE_REQUIRED' })

    const { data: thread, error: threadError } = await supabase
      .from('support_threads')
      .select('id, user_id, user_email, category, subject, status')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (threadError || !thread) return res.status(404).json({ error: 'Conversation not found.', code: 'THREAD_NOT_FOUND' })

    const { data: inserted, error: insertError } = await supabase
      .from('support_messages')
      .insert({
        thread_id: thread.id,
        user_id: user.id,
        sender_role: 'user',
        sender_email: user.email || thread.user_email || null,
        body
      })
      .select('id, sender_role, sender_email, body, created_at')
      .single()

    if (insertError) return res.status(500).json({ error: insertError.message, code: 'MESSAGE_INSERT_FAILED' })

    await supabase
      .from('support_threads')
      .update({ status: thread.status === 'closed' ? 'open' : thread.status, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', thread.id)

    let email = null
    try { email = await sendReplyEmail({ thread, user, message: body }) } catch (e) { email = { sent: false, error: e.message } }

    return res.status(200).json({ success: true, message: inserted, email })
  } catch (e) {
    console.error('Support reply error:', e)
    return res.status(e.statusCode || 500).json({ error: e.message || 'Could not send reply.', code: e.code || 'SUPPORT_REPLY_FAILED' })
  }
}

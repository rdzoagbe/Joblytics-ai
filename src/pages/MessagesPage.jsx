import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { supabase } from '../lib/supabase'
import './MessagesPage.css'
import './MessagesPageStable.css'

const URL_RE = /(https?:\/\/[^\s<>"')]+[^\s<>"').,;:])/gi
const SMART_SYNC_CACHE_VERSION = 'joblytics-smart-sync-v1'
const SMART_SYNC_CACHE_TTL_MS = 24 * 60 * 60 * 1000

function getSmartSyncCacheKey(userId) {
  return `${SMART_SYNC_CACHE_VERSION}:${userId || 'anonymous'}`
}

function loadSmartSyncCache(userId) {
  try {
    const raw = localStorage.getItem(getSmartSyncCacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const savedAt = parsed?.savedAt ? new Date(parsed.savedAt).getTime() : 0
    if (!savedAt || Date.now() - savedAt > SMART_SYNC_CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function saveSmartSyncCache(userId, payload) {
  try {
    localStorage.setItem(getSmartSyncCacheKey(userId), JSON.stringify({ ...payload, savedAt: new Date().toISOString() }))
  } catch {}
}

function formatDate(value) {
  if (!value) return ''
  try { return new Date(value).toLocaleString() } catch { return value }
}

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, ' ')
}

function cleanLinkLabel(url = '', index = 0, t) {
  const tr = (key, params, fallback) => (t ? t(key, params, fallback) : fallback)
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    const jobId = parsed.pathname.match(/\/jobs\/view\/(\d+)/)?.[1]
    if (host.includes('linkedin.com')) {
      if (jobId) return tr('msg_view_linkedin_job', { id: jobId }, `View LinkedIn job ${jobId}`)
      return tr('msg_open_linkedin', {}, 'Open LinkedIn link')
    }
    if (host.includes('smartrecruiters.com')) return tr('msg_open_portal', {}, 'Open application portal')
    if (host.includes('greenhouse.io')) return tr('msg_open_greenhouse', {}, 'Open Greenhouse application')
    if (host.includes('lever.co')) return tr('msg_open_lever', {}, 'Open Lever application')
    return tr('msg_open_host', { host }, `Open ${host}`)
  } catch {
    return tr('msg_open_link', { n: index + 1 }, `Open link ${index + 1}`)
  }
}

const SYNC_TYPE_KEYS = { Suggestion: 'msg_type_suggestion', Rejection: 'msg_type_rejection', Interview: 'msg_type_interview', 'Follow-up': 'msg_type_followup', Application: 'msg_type_application', Detected: 'msg_type_detected' }
function typeLabel(type = '', t) {
  const key = SYNC_TYPE_KEYS[type]
  return key && t ? t(key, type) : type
}

function isSeparatorLine(line = '') {
  return /^[-–—_\s]{8,}$/.test(String(line || '').trim())
}

function renderLineWithLinks(line = '', keyPrefix = 'line', t) {
  const decoded = decodeHtml(line)
  const parts = decoded.split(URL_RE)
  let linkIndex = 0
  return parts.map((part, index) => {
    if (!part) return null
    if (/^https?:\/\//i.test(part)) {
      const label = cleanLinkLabel(part, linkIndex, t)
      linkIndex += 1
      return <a key={`${keyPrefix}-link-${index}`} className="mailReaderLink" href={part} target="_blank" rel="noopener noreferrer">{label}</a>
    }
    return <React.Fragment key={`${keyPrefix}-text-${index}`}>{part}</React.Fragment>
  })
}

function EmailReader({ selected, t }) {
  const body = decodeHtml(selected?.body || '')
  const lines = body ? body.split(/\r?\n/) : []
  const sender = selected?.from || t('msg_unknown_sender', 'Unknown sender')
  const subject = selected?.subject || selected?.title || t('msg_email_content', 'Email content')
  const aiSummary = selected?.ai_summary || ''
  const suggestedAction = selected?.suggested_action || ''

  return (
    <section className="gmailReader">
      <div className="gmailReaderToolbar">
        <span>{t('msg_email', 'Email')}</span>
        <em>{selected?.date || ''}</em>
      </div>

      <div className="gmailReaderHeader">
        <div className="gmailAvatar">{sender.slice(0, 1).toUpperCase()}</div>
        <div>
          <h3>{subject}</h3>
          <p><strong>{sender}</strong> <span>{t('msg_to_me', 'to me')}</span></p>
        </div>
      </div>

      {(aiSummary || suggestedAction) && (
        <div style={{ margin: '0 16px 12px', padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 900, color: 'var(--accent)', letterSpacing: '.1em', textTransform: 'uppercase' }}>{t('msg_ai_summary', 'AI Summary')}</p>
          {aiSummary && <p style={{ margin: '0 0 5px', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{aiSummary}</p>}
          {suggestedAction && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>→ {suggestedAction}</p>}
        </div>
      )}

      <div className="gmailReaderBody">
        {lines.length ? lines.map((line, index) => {
          if (isSeparatorLine(line)) return <hr key={`mail-hr-${index}`} />
          const empty = !line.trim()
          return <p key={`mail-line-${index}`} className={empty ? 'is-spacer' : ''}>{empty ? ' ' : renderLineWithLinks(line, `mail-${index}`, t)}</p>
        }) : <p>{t('msg_no_body', 'No email body was returned for this signal.')}</p>}
      </div>
    </section>
  )
}

function CalendarInvite({ selected, t }) {
  const body = decodeHtml(selected?.body || '')
  const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const title = selected?.subject || selected?.title || lines[0] || t('msg_calendar_invite', 'Calendar invitation')
  const location = selected?.platform && selected.platform !== 'Calendar' ? selected.platform : ''
  const attendees = selected?.from || ''

  return (
    <section className="calendarInvitePreview">
      <div className="calendarInviteHeader">
        <span>CAL</span>
        <div>
          <p>{t('msg_calendar_invite', 'Calendar invitation')}</p>
          <h3>{title}</h3>
        </div>
      </div>

      <div className="calendarInviteFacts">
        <div><span>{t('msg_when', 'When')}</span><strong>{selected?.date || t('msg_not_specified', 'Not specified')}</strong></div>
        <div><span>{t('msg_where', 'Where')}</span><strong>{location || t('msg_not_specified', 'Not specified')}</strong></div>
        <div><span>{t('msg_attendees', 'Attendees')}</span><strong>{attendees || t('msg_not_specified', 'Not specified')}</strong></div>
        <div><span>{t('msg_status', 'Status')}</span><strong>{typeLabel(selected?.type, t) || t('msg_detected', 'Detected')}</strong></div>
      </div>

      <div className="calendarInviteBody">
        {(lines.length ? lines : [body || t('msg_no_invite_desc', 'No invitation description was returned.')]).map((line, index) => (
          <p key={`calendar-line-${index}`}>{renderLineWithLinks(line, `calendar-${index}`, t)}</p>
        ))}
      </div>
    </section>
  )
}

async function getFreshAccessToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

function getAccountEmail(user) {
  const metadata = user?.user_metadata || {}
  const identity = user?.identities?.[0]?.identity_data || {}
  return user?.email || metadata.email || metadata.preferred_username || metadata.upn || identity.email || identity.preferred_username || ''
}

function getSignedInProvider(user) {
  const provider = String(user?.app_metadata?.provider || '').toLowerCase()
  if (provider === 'google') return 'google'
  if (provider === 'azure' || provider === 'microsoft') return 'microsoft'
  return 'google'
}

function getProviderLabel(provider) {
  return provider === 'microsoft' ? 'Outlook / Microsoft Calendar' : 'Gmail / Google Calendar'
}

function getProviderApiLabel(provider) {
  return provider === 'microsoft' ? 'Microsoft' : 'Google'
}

function getSyncType(item = {}) {
  const text = `${item.status || ''} ${item.detected_status || ''} ${item.eventType || ''} ${item.subject || ''} ${item.title || ''} ${item.body || ''} ${item.snippet || ''}`.toLowerCase()
  const sender = String(item.from || item.sender || '').toLowerCase()
  if (text.includes('suggestion') || text.includes('recommended') || sender.includes('match.indeed.com')) return 'Suggestion'
  if (text.includes('reject') || text.includes('refus') || text.includes('unfortunately') || text.includes('malheureusement')) return 'Rejection'
  if (text.includes('interview') || text.includes('entretien') || text.includes('screening')) return 'Interview'
  if (text.includes('follow') || text.includes('availability') || text.includes('disponibilité')) return 'Follow-up'
  if (text.includes('application') || text.includes('candidature')) return 'Application'
  return item.status || item.detected_status || 'Detected'
}

function normalizeEmail(item = {}, index = 0) {
  const company = item.company || item.matchedCompany || ''
  const role = item.role_title || item.roleTitle || item.matchedJobTitle || ''
  return {
    id: item.id || item.provider_event_id || item.external_id || item.subject || `email-${index}`,
    title: item.title || [company, role].filter(Boolean).join(' — ') || item.subject || 'Detected job email',
    subject: item.subject || item.title || 'Job-related email detected',
    type: getSyncType(item),
    from: item.from || item.sender || item.sender_or_attendees || 'Unknown sender',
    date: item.date || item.event_date || item.event_at ? formatDate(item.date || item.event_date || item.event_at) : '',
    company,
    role,
    platform: item.platform || item.source || 'Email',
    body: item.body || item.emailBody || item.snippet || item.summary || '',
    ai_summary: item.ai_summary || '',
    suggested_action: item.suggested_action || '',
    confidence: item.confidenceLabel || item.confidence_label || (item.confidence ? `${Math.round(Number(item.confidence) * 100)}% confidence` : 'Detected')
  }
}

function normalizeCalendar(item = {}, index = 0) {
  return {
    id: item.id || item.provider_event_id || item.subject || `calendar-${index}`,
    title: item.title || item.matchedJobTitle || item.company || 'Detected calendar event',
    subject: item.eventTitle || item.subject || 'Recruitment calendar event',
    type: getSyncType(item),
    date: item.date || item.event_at ? formatDate(item.date || item.event_at) : '',
    from: item.attendees || item.sender_or_attendees || '',
    company: item.company || '',
    role: item.matchedJobTitle || '',
    platform: item.location || 'Calendar',
    body: item.detail || item.snippet || '',
    confidence: item.confidenceLabel || 'Detected'
  }
}

function signalTone(type = '') {
  const value = type.toLowerCase()
  if (value.includes('reject')) return 'red'
  if (value.includes('follow')) return 'amber'
  if (value.includes('interview')) return 'blue'
  return 'blue'
}

function Metric({ label, value, text, preview }) {
  return <article className="messagesStableMetric"><p>{label}</p><strong>{preview ? '—' : value}</strong><span>{text}</span></article>
}

const PREVIEW_EMAILS = [
  { id: 'preview-1', title: 'Acme Corp — Product Manager', subject: 'Your application has been received', type: 'Application', date: '', confidence: 'Preview example', body: '' },
  { id: 'preview-2', title: 'TechCorp — Frontend Engineer', subject: 'Interview invitation — Thursday 2pm', type: 'Interview', date: '', confidence: 'Preview example', body: '' },
  { id: 'preview-3', title: 'StartupXYZ — UX Designer', subject: 'Thank you for your interest…', type: 'Rejection', date: '', confidence: 'Preview example', body: '' }
]
const PREVIEW_CALENDAR = [
  { id: 'preview-cal-1', title: 'TechCorp — Technical Interview', subject: 'Video call with engineering team', type: 'Interview', date: '', confidence: 'Preview example', body: '' }
]

function SignalList({ items, selectedId, onSelect, tab, isPreviewMode, t }) {
  const displayItems = items.length ? items : (isPreviewMode ? (tab === 'calendar' ? PREVIEW_CALENDAR : PREVIEW_EMAILS) : [])

  if (!displayItems.length) {
    if (tab === 'calendar') {
      return <div className="messagesStableEmpty"><strong>{t('msg_no_interview_events', 'No interview events detected')}</strong><p>{t('msg_no_interview_events_desc', 'Interview meetings and recruitment events will appear here after Smart Sync scans your calendar.')}</p></div>
    }
    return <div className="messagesStableEmpty"><strong>{t('msg_no_signals', 'No detected signals yet')}</strong><p>{t('msg_no_signals_desc', 'Run Smart Sync to detect job-related emails and calendar events.')}</p></div>
  }

  const isExample = isPreviewMode && !items.length

  return (
    <div className="messagesStableSignals">
      {isExample && (
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', background: 'var(--bg-input)', borderBottom: '1px solid var(--border)' }}>
          {t('msg_preview_examples', 'Preview examples — connect to see real signals')}
        </div>
      )}
      {displayItems.map(item => (
        <button key={item.id} type="button" className={`messagesStableSignal ${selectedId === item.id ? 'is-selected' : ''} ${isExample ? 'is-preview' : ''}`} onClick={() => !isExample && onSelect(item)} style={isExample ? { opacity: 0.55, cursor: 'default', pointerEvents: 'none' } : {}}>
          <span className={`statusPill ${signalTone(item.type)}`}>{typeLabel(item.type, t)}</span>
          <strong>{item.title}</strong>
          <span className="messagesStableSignalSub">{item.subject}</span>
          <em>{isExample ? t('msg_preview_example', 'Preview example') : (item.date || item.confidence)}</em>
        </button>
      ))}
    </div>
  )
}

function SignalDetail({ selected, mode, t }) {
  if (!selected) {
    return <div className="messagesStableDetailEmpty"><strong>{t('msg_select_signal', 'Select a signal')}</strong><p>{t('msg_select_signal_desc', 'Choose an item from the list to review the detected email or calendar event.')}</p></div>
  }

  const isCalendar = mode === 'calendar'

  return (
    <article className="messagesStableDetail messagesReaderDetail">
      {isCalendar ? <CalendarInvite selected={selected} t={t} /> : <EmailReader selected={selected} t={t} />}
    </article>
  )
}

export default function MessagesPage({ setPage }) {
  const { user } = useAuth()
  const { t } = useLang()
  const autoRefreshAttempted = useRef(false)
  const [threads, setThreads] = useState([])
  const [loadingThreads, setLoadingThreads] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [provider, setProvider] = useState(() => getSignedInProvider(user))
  const [connections, setConnections] = useState(new Set())
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncNotice, setSyncNotice] = useState('')
  const [syncSuccess, setSyncSuccess] = useState('')
  const [emails, setEmails] = useState([])
  const [calendar, setCalendar] = useState([])
  const [tab, setTab] = useState('emails')
  const [selected, setSelected] = useState(null)
  const [lastSyncAt, setLastSyncAt] = useState('')
  const [mobileView, setMobileView] = useState('list')

  const accountEmail = getAccountEmail(user)
  const providerConnected = connections.has(provider)
  const isPreviewMode = !providerConnected && emails.length === 0 && calendar.length === 0

  useEffect(() => {
    const next = getSignedInProvider(user)
    setProvider(next)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    const cached = loadSmartSyncCache(user.id)
    if (!cached) return

    const cachedEmails = Array.isArray(cached.emails) ? cached.emails.map(normalizeEmail) : []
    const cachedCalendar = Array.isArray(cached.calendar) ? cached.calendar.map(normalizeCalendar) : []
    const cachedProviders = Array.isArray(cached.providers) ? cached.providers : []

    setEmails(cachedEmails)
    setCalendar(cachedCalendar)
    setTab(cached.tab || (cachedEmails.length ? 'emails' : 'calendar'))
    setLastSyncAt(cached.lastSyncAt || cached.savedAt || '')
    if (cachedProviders.length) setConnections(prev => new Set([...prev, ...cachedProviders]))
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    setLoadingThreads(true)
    setThreadError('')
    supabase
      .from('support_threads')
      .select('id, subject, category, status, user_email, last_message_at, created_at')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) setThreadError(error.message || t('msg_load_support_err', 'Could not load support messages.'))
        else setThreads(data || [])
      })
      .finally(() => setLoadingThreads(false))
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('job_sync_connections')
      .select('provider')
      .eq('user_id', user.id)
      .eq('status', 'connected')
      .then(({ data }) => {
        if (data?.length) setConnections(new Set(data.map(item => item.provider)))
      })
  }, [user?.id])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sync = params.get('sync')
    if (sync === 'connected') {
      const connectedProvider = params.get('provider') || provider
      setConnections(prev => new Set([...prev, connectedProvider]))
      setSyncNotice(t('msg_notice_connected', 'Account connected. Smart Sync will refresh automatically.'))
      autoRefreshAttempted.current = false
    }
    if (sync === 'failed') setSyncNotice(params.get('reason') || t('msg_notice_failed', 'Smart Sync connection failed.'))
    if (sync === 'cancelled') setSyncNotice(t('msg_notice_cancelled', 'Smart Sync connection was cancelled.'))
    if (sync) window.history.replaceState({}, '', '/messages')
  }, [provider])

  const allSignals = tab === 'calendar' ? calendar : emails
  const stats = useMemo(() => {
    const combined = [...emails, ...calendar]
    return {
      total: combined.length,
      applications: combined.filter(item => item.type === 'Application').length,
      interviews: combined.filter(item => item.type === 'Interview').length,
      rejections: combined.filter(item => item.type === 'Rejection').length,
      followups: combined.filter(item => item.type === 'Follow-up').length
    }
  }, [emails, calendar])

  useEffect(() => {
    const first = allSignals[0] || null
    setSelected(current => current && allSignals.some(item => item.id === current.id) ? current : first)
    setMobileView('list')
  }, [tab, emails, calendar])

  const connectProvider = async () => {
    setSyncLoading(true)
    setSyncNotice('')
    setSyncSuccess('')
    try {
      const token = await getFreshAccessToken()
      if (!token) throw new Error(t('msg_signin', 'Please sign in again.'))
      const res = await fetch('/api/mail-sync-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider, login_hint: accountEmail || undefined })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) throw new Error(data?.error || t('msg_could_not_start', { provider: getProviderApiLabel(provider) }, `Could not start ${getProviderApiLabel(provider)} sync.`))
      window.location.href = data.url
    } catch (error) {
      setSyncNotice(error.message || t('msg_could_not_connect', 'Could not connect your account.'))
    } finally {
      setSyncLoading(false)
    }
  }

  const runSmartSync = async ({ silent = false } = {}) => {
    setSyncLoading(true)
    if (!silent) setSyncNotice('')
    if (!silent) setSyncSuccess('')
    try {
      const token = await getFreshAccessToken()
      if (!token) throw new Error(t('msg_signin', 'Please sign in again.'))
      const res = await fetch('/api/smart-job-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } })
      const data = await res.json().catch(() => ({}))
      if (data?.code === 'MAIL_CALENDAR_SYNC_NOT_CONNECTED' || data?.code === 'GOOGLE_SYNC_NOT_CONNECTED') {
        setSyncNotice(t('msg_connect_first', 'Connect read-only access first, then run Smart Sync.'))
        setConnections(new Set())
        return
      }
      if (!res.ok) throw new Error(data?.error || t('msg_sync_failed', { status: res.status }, `Smart Sync failed (${res.status}).`))
      const nextEmails = Array.isArray(data.emails) ? data.emails.map(normalizeEmail) : []
      const nextCalendar = Array.isArray(data.calendar) ? data.calendar.map(normalizeCalendar) : []
      const nextProviders = data.providers?.length ? data.providers : Array.from(connections)
      const nextTab = nextEmails.length ? 'emails' : 'calendar'
      const syncedAt = new Date().toISOString()

      if (nextProviders.length) setConnections(new Set(nextProviders))
      setEmails(nextEmails)
      setCalendar(nextCalendar)
      setTab(nextTab)
      setLastSyncAt(syncedAt)
      saveSmartSyncCache(user?.id, {
        emails: nextEmails,
        calendar: nextCalendar,
        providers: nextProviders,
        tab: nextTab,
        lastSyncAt: syncedAt
      })
      setSyncSuccess(t('msg_sync_complete', { scanned: data.scanned || 0, stored: data.eventsStored || 0, updated: data.analysesUpdated || 0 }, `Smart Sync complete: ${data.scanned || 0} signals scanned, ${data.eventsStored || 0} events saved, ${data.analysesUpdated || 0} jobs updated.`))
    } catch (error) {
      setSyncNotice(error.message || t('msg_sync_incomplete', 'Smart Sync could not complete.'))
    } finally {
      setSyncLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.id || syncLoading || autoRefreshAttempted.current) return
    if (!providerConnected) return
    if (emails.length || calendar.length) return

    autoRefreshAttempted.current = true
    runSmartSync({ silent: true })
  }, [user?.id, providerConnected, emails.length, calendar.length, syncLoading])

  const handlePrimarySync = () => providerConnected ? runSmartSync() : connectProvider()

  return (
    <div className="messagesPage messagesStablePage">
      <main className="messagesShell messagesStableShell">
        <section className="newSyncPanel messagesStableHero">
          <div className="newSyncHeader">
            <p>{t('msg_smart_tracking', 'SMART TRACKING')}</p>
            <h2>{t('msg_sync_title', 'Sync your mail and calendar')}</h2>
            <span>{t('msg_sync_desc', 'Connect read-only access, then let Joblytics detect applications, replies, interviews, rejections and follow-ups from job-related emails and calendar events.')}</span>
          </div>

          <div className="messagesStableConnect">
            <div>
              <p>{t('msg_connected_account', 'Connected account')}</p>
              <h3>{getProviderLabel(provider)}</h3>
              <span>{accountEmail || t('msg_no_email', 'No email detected')}</span>
            </div>
            {!getSignedInProvider(user) && (
              <select value={provider} onChange={event => setProvider(event.target.value)}>
                <option value="google">{t('msg_google_opt', 'Gmail / Google Calendar')}</option>
                <option value="microsoft">{t('msg_ms_opt', 'Outlook / Microsoft Calendar')}</option>
              </select>
            )}
            <button type="button" className="newSyncRunBtn messagesStablePrimary" onClick={handlePrimarySync} disabled={syncLoading}>
              {syncLoading ? t('msg_working', 'Working…') : providerConnected ? t('msg_refresh', 'Refresh Smart Sync now') : t('msg_connect_run', 'Connect & run Smart Sync')}
            </button>
            <em>{providerConnected ? t('msg_ro_active', 'Read-only access active') : t('msg_ro_needed', 'Read-only access needed')} · {t('msg_last_sync', 'Last sync')}: {lastSyncAt ? formatDate(lastSyncAt) : t('msg_never', 'Never')}</em>
          </div>

          {syncNotice && <p className="messagesNotice">ℹ {syncNotice}</p>}
          {syncSuccess && <p className="messagesSuccess">✓ {syncSuccess}</p>}
        </section>

        <section className="messagesStableMetrics">
          {isPreviewMode && (
            <div style={{ gridColumn: '1 / -1', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', background: 'var(--accent-bg)', color: 'var(--accent)', borderRadius: 6, padding: '2px 8px', display: 'inline-block', marginBottom: 8 }}>{t('msg_not_connected', 'Not connected yet')}</span>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{t('msg_preview_title', 'Smart Sync reads your inbox for job signals')}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{t('msg_preview_desc', 'Once connected, Joblytics scans job-related emails and calendar events — detecting application confirmations, recruiter replies, interview invites, and rejections automatically.')}</p>
                </div>
                <button type="button" onClick={handlePrimarySync} disabled={syncLoading} style={{ fontSize: 12, fontWeight: 800, color: 'var(--bg)', background: 'var(--text-primary)', border: 'none', borderRadius: 999, padding: '9px 18px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {syncLoading ? t('msg_connecting', 'Connecting…') : t('msg_connect_sync', 'Connect & sync now')}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { step: '1', label: t('msg_step1_label', 'Connect Gmail or Outlook'), desc: t('msg_step1_desc', 'Read-only access, revoke any time') },
                  { step: '2', label: t('msg_step2_label', 'Run Smart Sync'), desc: t('msg_step2_desc', 'Scans last 90 days of job emails') },
                  { step: '3', label: t('msg_step3_label', 'See your pipeline'), desc: t('msg_step3_desc', 'Interviews, rejections and follow-ups') }
                ].map(({ step, label, desc }) => (
                  <div key={step} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
                    <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 99, background: 'var(--text-primary)', color: 'var(--bg)', fontSize: 10, fontWeight: 950, marginBottom: 6 }}>{step}</span>
                    <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>{label}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Metric label={t('msg_m_tracked', 'Tracked signals')} value={stats.total} text={t('msg_m_tracked_sub', 'Email and calendar events')} preview={isPreviewMode} />
          <Metric label={t('msg_m_apps', 'Applications')} value={stats.applications} text={t('msg_m_apps_sub', 'Confirmed applications')} preview={isPreviewMode} />
          <Metric label={t('msg_m_interviews', 'Interviews')} value={stats.interviews} text={t('msg_m_interviews_sub', 'Detected interviews')} preview={isPreviewMode} />
          <Metric label={t('msg_m_rejections', 'Rejections')} value={stats.rejections} text={t('msg_m_rejections_sub', 'Negative replies')} preview={isPreviewMode} />
          <Metric label={t('msg_m_followups', 'Follow-ups')} value={stats.followups} text={t('msg_m_followups_sub', 'Potential actions')} preview={isPreviewMode} />
        </section>

        <section className="messagesStableInbox">
          <div className="messagesStableTabs">
            <button type="button" className={tab === 'emails' ? 'is-active' : ''} onClick={() => { setTab('emails'); setMobileView('list') }}>{t('msg_tab_emails', 'Emails')} <span>{emails.length}</span></button>
            <button type="button" className={tab === 'calendar' ? 'is-active' : ''} onClick={() => { setTab('calendar'); setMobileView('list') }}>{t('msg_tab_calendar', 'Calendar')} <span>{calendar.length}</span></button>
          </div>
          <div className={`messagesStableSplit ${mobileView === 'detail' ? 'show-detail' : 'show-list'}`}>
            <SignalList
              items={allSignals}
              selectedId={selected?.id}
              onSelect={item => { setSelected(item); setMobileView('detail') }}
              tab={tab}
              isPreviewMode={isPreviewMode}
              t={t}
            />
            <div>
              <button type="button" className="msgMobileBack" onClick={() => setMobileView('list')}>{tab === 'calendar' ? t('msg_back_calendar', '← Back to Calendar') : t('msg_back_emails', '← Back to Emails')}</button>
              <SignalDetail selected={selected} mode={tab} t={t} />
            </div>
          </div>
        </section>

        <section className="messagesRequestPanel messagesStableSupport">
          <div className="messagesRequestHero">
            <div>
              <p>{t('messages_kicker', 'Messages')}</p>
              <h1>{t('messages_title', 'Support conversations')}</h1>
              <span>{t('messages_subtitle', 'Track submitted support requests and future Joblytics updates.')}</span>
            </div>
            <button type="button" className="messagesHeroButton" onClick={() => setPage?.('contact')}>{t('messages_new_request', 'New request')}</button>
          </div>

          {threadError && <p className="messagesError">⚠ {threadError}</p>}
          {loadingThreads && <p className="messagesMuted">{t('msg_loading_support', 'Loading support conversations…')}</p>}
          {!loadingThreads && !threads.length && (
            <div className="messagesEmpty">
              <strong>{t('msg_no_support', 'No support conversations yet')}</strong>
              <p>{t('msg_no_support_desc', 'When you submit a support request, it will appear here.')}</p>
              <button type="button" onClick={() => setPage?.('contact')}>{t('msg_contact_support', 'Contact support')}</button>
            </div>
          )}
          {!!threads.length && (
            <div className="messagesStableThreadList">
              {threads.map(thread => (
                <article key={thread.id} className="messagesThread">
                  <span>{thread.category || t('msg_support', 'Support')}</span>
                  <strong>{thread.subject || t('msg_support_request', 'Support request')}</strong>
                  <em>{thread.status || t('msg_open', 'open')} · {formatDate(thread.last_message_at || thread.created_at)}</em>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

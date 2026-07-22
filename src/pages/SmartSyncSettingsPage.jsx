import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { supabase } from '../lib/supabase'

const cv = n => `var(${n})`

function formatDate(v, t) {
  if (!v) return t ? t('ss_never', 'Never') : 'Never'
  try { return new Date(v).toLocaleString() } catch { return String(v) }
}

async function getFreshToken() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || null
}

function Card({ children }) {
  return (
    <div style={{ background: cv('--bg-card'), border: `1px solid ${cv('--border')}`, borderRadius: 20, padding: '22px 24px' }}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: cv('--text-secondary') }}>{children}</p>
}

function Stat({ label, value, valueColor }) {
  return (
    <div>
      <p style={{ margin: '0 0 2px', fontSize: 11, color: cv('--text-secondary') }}>{label}</p>
      <strong style={{ fontSize: 13, color: valueColor || cv('--text-primary') }}>{value}</strong>
    </div>
  )
}

function TechRow({ label, value, isError }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${cv('--border')}` }}>
      <span style={{ fontSize: 12, color: cv('--text-secondary') }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: isError ? '#ef4444' : cv('--text-primary') }}>{value}</span>
    </div>
  )
}

function ActionBtn({ label, onClick, disabled, primary, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 18px',
        borderRadius: 12,
        fontWeight: 700,
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        background: danger ? 'transparent' : primary ? cv('--accent') : cv('--bg-input'),
        color: danger ? '#ef4444' : primary ? '#fff' : cv('--text-primary'),
        border: danger ? '1px solid #ef4444' : primary ? 'none' : `1px solid ${cv('--border')}`,
        transition: 'opacity .15s',
        textAlign: 'left'
      }}
    >{label}</button>
  )
}

export default function SmartSyncSettingsPage({ setPage }) {
  const { user } = useAuth()
  const { t } = useLang()
  const [connection, setConnection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!user?.id) { setLoading(false); return }
    supabase
      .from('job_sync_connections')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setConnection(data || null))
      .finally(() => setLoading(false))
  }, [user?.id])

  const isConnected = connection?.status === 'connected'
  const provider = connection?.provider || 'google'
  const providerLabel = provider === 'microsoft' ? 'Outlook / Microsoft Calendar' : 'Gmail / Google Calendar'
  const accountEmail = user?.email || user?.user_metadata?.email || '—'
  const healthLabel = isConnected ? t('ss_ready', 'Ready') : connection ? t('ss_disconnected', 'Disconnected') : t('ss_preview_mode', 'Preview mode')
  const healthColor = isConnected ? '#22c55e' : '#f59e0b'

  const handleConnect = async (p) => {
    setWorking(true); setNotice('')
    try {
      const token = await getFreshToken()
      if (!token) throw new Error(t('ss_signin', 'Please sign in again.'))
      const res = await fetch('/api/mail-sync-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: p })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) throw new Error(data?.error || t('ss_could_not_start', 'Could not start sync.'))
      window.location.href = data.url
    } catch (err) {
      setNotice(err.message || t('ss_connection_failed', 'Connection failed.'))
      setWorking(false)
    }
  }

  const handleRunSync = async () => {
    setWorking(true); setNotice('')
    try {
      const token = await getFreshToken()
      if (!token) throw new Error(t('ss_signin', 'Please sign in again.'))
      const res = await fetch('/api/smart-job-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      if (data?.code === 'MAIL_CALENDAR_SYNC_NOT_CONNECTED' || data?.code === 'GOOGLE_SYNC_NOT_CONNECTED') {
        setNotice(t('ss_no_account', 'No connected account found. Connect Google or Microsoft first.'))
        return
      }
      if (!res.ok) throw new Error(data?.error || t('ss_sync_failed', { status: res.status }, `Smart Sync failed (${res.status}).`))
      const total = (data.emails?.length || 0) + (data.calendar?.length || 0)
      setNotice(total === 1 ? t('ss_sync_complete_one', { n: total }, `Sync complete — ${total} signal detected.`) : t('ss_sync_complete_many', { n: total }, `Sync complete — ${total} signals detected.`))
    } catch (err) {
      setNotice(err.message || t('ss_sync_incomplete', 'Smart Sync could not complete.'))
    } finally {
      setWorking(false)
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm(t('ss_disconnect_confirm', 'Disconnect your account? Joblytics will stop scanning your emails and calendar immediately.'))) return
    setWorking(true); setNotice('')
    try {
      const { error } = await supabase
        .from('job_sync_connections')
        .update({ status: 'disconnected' })
        .eq('user_id', user.id)
        .eq('provider', provider)
      if (error) throw error
      setConnection(prev => prev ? { ...prev, status: 'disconnected' } : null)
      setNotice(t('ss_disconnected_notice', 'Account disconnected. Joblytics will no longer scan your emails or calendar.'))
    } catch (err) {
      setNotice(err.message || t('ss_could_not_disconnect', 'Could not disconnect.'))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => setPage?.('messages')}
          style={{ background: 'none', border: `1px solid ${cv('--border')}`, borderRadius: 10, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: cv('--text-secondary'), cursor: 'pointer', whiteSpace: 'nowrap', marginTop: 3 }}
        >{t('ss_back', '← Back')}</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: cv('--text-primary'), letterSpacing: '-.03em' }}>{t('ss_title', 'Smart Sync settings')}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: cv('--text-secondary') }}>{t('ss_subtitle', 'Manage how Joblytics reads job-related emails and calendar events.')}</p>
        </div>
      </div>

      {loading && <p style={{ color: cv('--text-secondary'), fontSize: 14, margin: 0 }}>{t('ss_loading', 'Loading…')}</p>}

      {!loading && <>
        <Card>
          <SectionLabel>{t('ss_connection_status', 'Connection status')}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
            <Stat label={t('ss_connected_provider', 'Connected provider')} value={isConnected ? providerLabel : t('ss_not_connected', 'Not connected')} />
            <Stat label={t('ss_account', 'Account')} value={accountEmail} />
            <Stat label={t('ss_email_sync', 'Email sync')} value={isConnected ? t('ss_enabled', 'Enabled') : t('ss_not_connected', 'Not connected')} />
            <Stat label={t('ss_calendar_sync', 'Calendar sync')} value={isConnected ? t('ss_enabled', 'Enabled') : t('ss_not_connected', 'Not connected')} />
            <Stat label={t('ss_last_sync', 'Last sync')} value={formatDate(connection?.updated_at || connection?.created_at, t)} />
            <Stat label={t('ss_sync_health', 'Sync health')} value={healthLabel} valueColor={healthColor} />
          </div>
        </Card>

        <Card>
          <SectionLabel>{t('ss_permissions', 'Permissions & privacy')}</SectionLabel>
          <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              t('ss_perm_1', 'Read-only access — Joblytics never sends, modifies, or deletes your emails or calendar events.'),
              t('ss_perm_2', 'Only job-search signals are processed: application confirmations, interview invites, rejections, and recruiter messages.'),
              t('ss_perm_3', 'You can disconnect at any time. Scanning stops immediately.'),
              t('ss_perm_4', 'Access tokens are stored securely server-side and never exposed to the browser.')
            ].map((line, i) => (
              <li key={i} style={{ fontSize: 13, color: cv('--text-secondary'), lineHeight: 1.6 }}>{line}</li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionLabel>{t('ss_actions', 'Actions')}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!isConnected ? <>
              <ActionBtn label={t('ss_connect_google', 'Connect Google (Gmail + Calendar)')} onClick={() => handleConnect('google')} disabled={working} primary />
              <ActionBtn label={t('ss_connect_microsoft', 'Connect Microsoft (Outlook + Calendar)')} onClick={() => handleConnect('microsoft')} disabled={working} />
            </> : <>
              <ActionBtn label={t('ss_run_now', 'Run Smart Sync now')} onClick={handleRunSync} disabled={working} primary />
              <ActionBtn label={t('ss_disconnect_account', 'Disconnect account')} onClick={handleDisconnect} disabled={working} danger />
            </>}
          </div>
        </Card>

        <Card>
          <SectionLabel>{t('ss_technical', 'Technical status')}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <TechRow label={t('ss_connection_record', 'Connection record')} value={connection ? t('ss_yes', 'Yes') : t('ss_no', 'No')} />
            <TechRow label={t('ss_status', 'Status')} value={connection?.status || t('ss_none', 'None')} />
            <TechRow label={t('ss_provider', 'Provider')} value={connection?.provider || '—'} />
            <TechRow label={t('ss_email_scope', 'Email scope')} value={connection ? t('ss_granted', 'Granted') : '—'} />
            <TechRow label={t('ss_calendar_scope', 'Calendar scope')} value={connection ? t('ss_granted', 'Granted') : '—'} />
            {connection?.error && <TechRow label={t('ss_last_error', 'Last error')} value={connection.error} isError />}
          </div>
        </Card>

        {notice && (
          <p style={{ fontSize: 13, color: cv('--text-primary'), background: cv('--bg-input'), border: `1px solid ${cv('--border')}`, padding: '12px 16px', borderRadius: 10, margin: 0 }}>
            {notice}
          </p>
        )}
      </>}
    </div>
  )
}

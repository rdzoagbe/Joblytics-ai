import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

// Global, non-blocking banner shown when the Supabase backend can't be reached
// (e.g. a paused project or a network outage). Auth-dependent features won't
// work until the connection is restored, so we tell the user plainly instead of
// letting the app hang or silently fail.
export default function BackendStatusBanner() {
  const { backendUnavailable, retryConnection } = useAuth()
  const [retrying, setRetrying] = useState(false)

  if (!backendUnavailable) return null

  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try {
      await retryConnection?.()
    } catch {
      // syncSession already flags the outage; nothing more to do here.
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483000,
        background: '#7A2E2E',
        color: '#fff',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
        fontSize: 13,
        lineHeight: 1.4,
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)'
      }}
    >
      <span style={{ maxWidth: 640, textAlign: 'center' }}>
        <strong>Can’t reach the Joblytics servers.</strong> Sign-in, saving and history are
        temporarily unavailable. This usually clears on its own in a moment — check your
        connection or try again.
      </span>
      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        style={{
          padding: '6px 14px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.6)',
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
          fontWeight: 700,
          cursor: retrying ? 'default' : 'pointer',
          opacity: retrying ? 0.7 : 1,
          flexShrink: 0
        }}
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )
}

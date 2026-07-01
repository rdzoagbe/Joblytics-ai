import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { legalAcceptancePayload } from '../lib/legal'
import { clearPreviousUserBrowserData, getNormalizedUserMetadata, getUserEmail, getUserDisplayName } from '../lib/userProfile'
import { setUser as setSentryUser } from '../lib/sentry.js'

const AuthContext = createContext({})

// After this long, stop blocking the UI on the initial auth load. A paused or
// unreachable Supabase backend makes the token refresh hang/retry, which would
// otherwise keep the whole app stuck on the loading screen indefinitely.
const INITIAL_AUTH_TIMEOUT_MS = 8000

const isLikelyNetworkError = error => {
  if (!error) return false
  if (error.name === 'AuthRetryableFetchError') return true
  const msg = String(error.message || error).toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('err_name_not_resolved') ||
    msg.includes('name_not_resolved') ||
    msg.includes('load failed') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  )
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [backendUnavailable, setBackendUnavailable] = useState(false)

  const normalizeSignedInUserInBackground = signedInUser => {
    if (!signedInUser?.id) return

    try {
      clearPreviousUserBrowserData(signedInUser.id)
    } catch (error) {
      console.warn('User browser data isolation failed:', error)
    }

    const metadata = signedInUser.user_metadata || {}
    const displayName = getUserDisplayName(signedInUser)
    const email = getUserEmail(signedInUser)

    const alreadyNormalized =
      metadata.profile_normalized_at &&
      metadata.full_name &&
      (metadata.email || signedInUser.email)

    if (alreadyNormalized) return

    supabase.auth.updateUser({
      data: {
        ...metadata,
        ...getNormalizedUserMetadata(signedInUser, 'auth_background_normalize'),
        full_name: displayName,
        name: displayName,
        email
      }
    })
      .then(({ data, error }) => {
        if (!error && data?.user) setUser(data.user)
      })
      .catch(error => {
        console.warn('OAuth profile normalization failed:', error)
      })
  }

  const syncSession = async (forceRefresh = false) => {
    const result = forceRefresh
      ? await supabase.auth.refreshSession()
      : await supabase.auth.getSession()

    if (result?.error && isLikelyNetworkError(result.error)) {
      setBackendUnavailable(true)
      return session
    }

    const nextSession = result?.data?.session ?? null
    const nextUser = nextSession?.user ?? null

    setSession(nextSession)
    setUser(nextUser)
    // We successfully reached the backend, so clear any "unavailable" state.
    setBackendUnavailable(false)

    if (nextUser) normalizeSignedInUserInBackground(nextUser)

    return nextSession
  }

  useEffect(() => {
    let mounted = true
    let settled = false

    // Don't let a hung/paused backend keep the app stuck on the loading screen.
    // If the initial session load hasn't settled in time, stop blocking the UI
    // and surface a "backend unavailable" banner instead.
    const loadTimeout = window.setTimeout(() => {
      if (mounted && !settled) {
        setBackendUnavailable(true)
        setLoading(false)
      }
    }, INITIAL_AUTH_TIMEOUT_MS)

    syncSession(false)
      .catch(error => {
        console.warn('Initial auth session load failed:', error)
        if (mounted) {
          setSession(null)
          setUser(null)
          if (isLikelyNetworkError(error)) setBackendUnavailable(true)
        }
      })
      .finally(() => {
        settled = true
        window.clearTimeout(loadTimeout)
        if (mounted) setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user ?? null
      setSession(nextSession ?? null)
      setUser(nextUser)
      setSentryUser(nextUser)
      if (nextUser) normalizeSignedInUserInBackground(nextUser)
    })

    const refreshTimer = window.setInterval(() => {
      supabase.auth.getSession().then(({ data }) => {
        const expiresAt = data?.session?.expires_at ? data.session.expires_at * 1000 : 0
        const shouldRefresh =
          Boolean(data?.session?.refresh_token) &&
          expiresAt &&
          expiresAt - Date.now() < 5 * 60 * 1000

        if (shouldRefresh) syncSession(true).catch(error => {
          if (mounted && isLikelyNetworkError(error)) setBackendUnavailable(true)
        })
      }).catch(error => {
        if (mounted && isLikelyNetworkError(error)) setBackendUnavailable(true)
      })
    }, 60 * 1000)

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncSession(false).catch(error => {
        if (mounted && isLikelyNetworkError(error)) setBackendUnavailable(true)
      })
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const signUp = (email, password, legalSource = 'signup_email') => supabase.auth.signUp({
    email,
    password,
    options: { data: legalAcceptancePayload(legalSource) }
  })

  const signIn = async (email, password) => {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Sign in timed out. Check your internet connection or try again in a moment.')), 12000)
    )
    let result
    try {
      result = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        timeoutPromise
      ])
    } catch (e) {
      return { data: null, error: e }
    }
    if (!result.error && result.data?.session) {
      setSession(result.data.session)
      setUser(result.data.user)
      if (result.data.user) normalizeSignedInUserInBackground(result.data.user)
    }
    return result
  }

  const signInWithGoogle = (legalSource = 'signup_google') => supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      data: legalAcceptancePayload(legalSource)
    }
  })

  const signInWithMicrosoft = (legalSource = 'signup_microsoft') => supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: 'openid email profile User.Read',
      data: legalAcceptancePayload(legalSource)
    }
  })

  const signInWithLinkedIn = (legalSource = 'signup_linkedin') => supabase.auth.signInWithOAuth({
    provider: 'linkedin_oidc',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      data: legalAcceptancePayload(legalSource)
    }
  })

  const acceptCurrentTerms = async (source = 'terms_gate') => {
    const { data, error } = await supabase.auth.updateUser({ data: legalAcceptancePayload(source) })
    if (!error && data?.user) setUser(data.user)
    return { data, error }
  }

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      backendUnavailable,
      retryConnection: () => syncSession(false),
      refreshSession: () => syncSession(true),
      signUp,
      signIn,
      signInWithGoogle,
      signInWithMicrosoft,
      signInWithLinkedIn,
      acceptCurrentTerms,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

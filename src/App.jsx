import React, { Suspense, lazy, useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { useAuth } from './context/AuthContext'
import { hasAcceptedCurrentTerms } from './lib/legal'
import { supabase } from './lib/supabase'
import LandingPage from './pages/LandingPage'
import Onboarding from './components/Onboarding'
import EmailVerifyGate from './components/EmailVerifyGate'
import TermsGate from './components/TermsGate'
import AppNav from './components/AppNav'
import AppShellBar from './components/AppShellBar'
import SmartSyncUxBridge from './components/SmartSyncUxBridge'
import ErrorBoundary from './components/ErrorBoundary'
import './ui-polish.css'
import './smart-sync-phase5.css'
import './phase6-communication-assets.css'
import './cv-coach-layout-fix.css'
import './smart-sync-inbox-polish.css'

function lazyWithReload(factory) {
  return lazy(() =>
    factory().catch(err => {
      const key = 'joblytics_chunk_reload'
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
        return new Promise(() => {})
      }
      throw err
    })
  )
}

const Dashboard = lazyWithReload(() => import('./pages/Dashboard'))
const CareerDashboardPage = lazyWithReload(() => import('./pages/CareerDashboardPage'))
const PrivacyPage = lazyWithReload(() => import('./pages/PrivacyPage'))
const TermsPage = lazyWithReload(() => import('./pages/TermsPage'))
const LegalNoticePage = lazyWithReload(() => import('./pages/LegalNoticePage'))
const ContactPage = lazyWithReload(() => import('./pages/ContactPage'))
const MessagesPage = lazyWithReload(() => import('./pages/MessagesPage'))
const CvCoachPage = lazyWithReload(() => import('./pages/CvCoachPage'))
const ProfileOptimizerPage = lazyWithReload(() => import('./pages/ProfileOptimizerPage'))
const BillingPage = lazyWithReload(() => import('./pages/BillingPage'))
const AnalyzerPage = lazyWithReload(() => import('./pages/AnalyzerPage'))
const SmartSyncSettingsPage = lazyWithReload(() => import('./pages/SmartSyncSettingsPage'))
const CareerIntelligencePage = lazyWithReload(() => import('./pages/CareerIntelligencePage'))

const PAGE_TO_PATH = {
  dashboard: '/dashboard',
  analyzer: '/analyzer',
  history: '/history',
  coach: '/coach',
  profile: '/profile',
  billing: '/billing',
  messages: '/messages',
  contact: '/contact',
  'sync-settings': '/sync-settings',
  'career-intelligence': '/career-intelligence'
}

const PATH_TO_PAGE = Object.fromEntries(Object.entries(PAGE_TO_PATH).map(([page, path]) => [path, page]))
const PUBLIC_PATHS = new Set(['/privacy', '/terms', '/legal', '/auth/callback'])

function getPageFromPath() {
  const path = window.location.pathname || '/'
  if (PATH_TO_PAGE[path]) return PATH_TO_PAGE[path]
  if (path === '/') return 'dashboard'
  return null
}

function AppLoading() {
  return <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /></div>
}

function OAuthCallback() {
  useEffect(() => {
    let cancelled = false

    const completeOAuth = async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      if (error) {
        console.error('OAuth provider error:', error, errorDescription)
        if (!cancelled) {
          window.history.replaceState({ page: 'signin_error' }, '', '/')
          window.location.href = `/?auth_error=${encodeURIComponent(errorDescription || error)}`
        }
        return
      }

      let authFailed = false
      let authErrorMsg = ''

      try {
        if (code) {
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('OAuth code exchange failed:', exchangeError.message)
            authFailed = true
            authErrorMsg = exchangeError.message || 'Sign-in failed. Please try again.'
          } else if (!exchangeData?.session) {
            console.error('OAuth code exchange returned no session')
            authFailed = true
            authErrorMsg = 'Sign-in could not be completed — no session was returned. Please try again.'
          }
        } else {
          const { data, error: sessionError } = await supabase.auth.getSession()
          if (sessionError || !data?.session) {
            authFailed = true
            authErrorMsg = sessionError?.message || 'Sign-in could not be completed. Please try again.'
          }
        }
      } catch (err) {
        console.error('OAuth callback failed:', err)
        authFailed = true
        authErrorMsg = err?.message || 'Sign-in failed. Please try again.'
      }

      if (!cancelled) {
        if (authFailed) {
          window.location.href = `/?auth_error=${encodeURIComponent(authErrorMsg)}`
        } else {
          window.history.replaceState({ page: 'dashboard' }, '', '/dashboard')
          window.location.reload()
        }
      }
    }

    completeOAuth()
    return () => { cancelled = true }
  }, [])

  return <AppLoading />
}

export default function App() {
  const { user, loading } = useAuth()
  const [page, setPageState] = useState(() => getPageFromPath() || 'dashboard')
  const [selectedAnalysis, setSelectedAnalysis] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const setPage = nextPage => {
    setPageState(nextPage)
    const nextPath = PAGE_TO_PATH[nextPage]
    if (nextPath && window.location.pathname !== nextPath) window.history.pushState({ page: nextPage }, '', nextPath)
  }

  useEffect(() => {
    const handlePopState = () => {
      const nextPage = getPageFromPath()
      if (nextPage) setPageState(nextPage)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (user && hasAcceptedCurrentTerms(user) && !localStorage.getItem('fitscore_onboarded')) setShowOnboarding(true)
  }, [user])

  const path = window.location.pathname
  if (path === '/auth/callback') return <OAuthCallback />

  if (loading) return <AppLoading />
  if (path === '/privacy') return <Suspense fallback={<AppLoading />}><PrivacyPage onBack={() => window.history.back()} /></Suspense>
  if (path === '/terms') return <Suspense fallback={<AppLoading />}><TermsPage onBack={() => window.history.back()} /></Suspense>
  if (path === '/legal') return <Suspense fallback={<AppLoading />}><LegalNoticePage onBack={() => window.history.back()} /></Suspense>

  const routePage = getPageFromPath()
  if (!routePage && !PUBLIC_PATHS.has(path)) window.history.replaceState({ page: 'dashboard' }, '', '/dashboard')

  if (!user) return <LandingPage />
  if (user.email && !user.email_confirmed_at && user.app_metadata?.provider === 'email') return <EmailVerifyGate />
  if (!hasAcceptedCurrentTerms(user)) return <TermsGate />

  const selectAndGo = (analysis, targetPage) => {
    setSelectedAnalysis(analysis)
    setPage(targetPage)
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <CareerDashboardPage setPage={setPage} onOpenAnalysis={a => selectAndGo(a, 'analyzer')} />
      case 'analyzer': return <AnalyzerPage setPage={setPage} prefillAnalysis={selectedAnalysis} onClearPrefill={() => setSelectedAnalysis(null)} />
      case 'history': return <Dashboard onNewAnalysis={() => { setSelectedAnalysis(null); setPage('analyzer') }} onSelectAnalysis={a => selectAndGo(a, 'analyzer')} onBuildCv={a => selectAndGo(a, 'coach')} onGenerateMessage={a => selectAndGo(a, 'coach')} />
      case 'coach': return <CvCoachPage selectedAnalysis={selectedAnalysis} setPage={setPage} />
      case 'profile': return <ProfileOptimizerPage />
      case 'billing': return <BillingPage />
      case 'messages': return <MessagesPage setPage={setPage} />
      case 'sync-settings': return <SmartSyncSettingsPage setPage={setPage} />
      case 'career-intelligence': return <CareerIntelligencePage />
      case 'contact': return <ContactPage onBack={() => setPage('dashboard')} />
      default: return <CareerDashboardPage setPage={setPage} onOpenAnalysis={a => selectAndGo(a, 'analyzer')} />
    }
  }

  return <ErrorBoundary><div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text-primary)' }}><SmartSyncUxBridge />{showOnboarding && <Onboarding onDone={completed => { localStorage.setItem('fitscore_onboarded','true'); setShowOnboarding(false); if (completed) setPage('analyzer') }} />}<AppNav page={page} setPage={setPage} onLogoClick={() => { setSelectedAnalysis(null); setPage('dashboard') }} /><main className="appShellContent"><Suspense fallback={<AppLoading />}>{renderPage()}</Suspense></main><AppShellBar setPage={setPage} /></div><Analytics /></ErrorBoundary>
}

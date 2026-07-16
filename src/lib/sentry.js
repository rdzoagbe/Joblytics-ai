// @sentry/react is loaded lazily (dynamic import) so it no longer sits in the eager first-paint
// bundle. It's initialized on idle after the app renders. captureError/setUser buffer their
// most recent intent until Sentry is ready, then apply it — so we don't drop the signed-in
// user context or an error that fires during startup.
const dsn = import.meta.env.VITE_SENTRY_DSN

let sentryRef = null
let pendingUser = undefined // undefined = nothing pending; null = clear; object = set

function loadSentry() {
  return import('@sentry/react').then(Sentry => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE || 'production',
      release: import.meta.env.VITE_APP_VERSION || undefined,
      tracesSampleRate: 0.1,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error exception captured',
        /^Loading chunk \d+ failed/
      ]
    })
    sentryRef = Sentry
    if (pendingUser !== undefined) {
      Sentry.setUser(pendingUser)
      pendingUser = undefined
    }
    return Sentry
  }).catch(() => null)
}

export function initSentry() {
  if (!dsn) return
  const start = () => loadSentry()
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 4000 })
  } else {
    setTimeout(start, 1200)
  }
}

export function captureError(error, context) {
  if (!dsn) return
  const send = Sentry => Sentry && Sentry.captureException(error, context ? { extra: context } : undefined)
  if (sentryRef) send(sentryRef)
  else loadSentry().then(send) // ensure a startup error still gets reported
}

export function setUser(user) {
  if (!dsn) return
  const value = user ? { id: user.id, email: user.email } : null
  if (sentryRef) sentryRef.setUser(value)
  else pendingUser = value
}

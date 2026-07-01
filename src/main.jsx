import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { LangProvider } from './context/LangContext'
import App from './App.jsx'
import BackendStatusBanner from './components/BackendStatusBanner.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initSentry } from './lib/sentry.js'
import './index.css'

initSentry()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <LangProvider>
          <AuthProvider>
            <BackendStatusBanner />
            <App />
          </AuthProvider>
        </LangProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)

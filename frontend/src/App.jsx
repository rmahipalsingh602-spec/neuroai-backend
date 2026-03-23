import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom'

import AppLayout from './components/AppLayout.jsx'
import { PRIVACY_POLICY, REFUND_POLICY, TERMS_POLICY } from './lib/policies.js'
import {
  clearSession,
  getCachedUser,
  getMe,
  getStoredAccessToken,
  hasStoredSession,
  logoutSession,
  persistSession,
} from './lib/api.js'

const Login = lazy(() => import('./components/Login.jsx'))
const Signup = lazy(() => import('./components/Signup.jsx'))
const Dashboard = lazy(() => import('./components/Dashboard.jsx'))
const PolicyPage = lazy(() => import('./components/PolicyPage.jsx'))

function LoadingScreen({
  eyebrow = 'Booting',
  title = 'Loading NeuroAI Pro',
  description = 'Preparing your workspace.',
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-charcoal-dark">
      <div className="rounded-[32px] border border-slate-200/80 dark:border-charcoal-light/20 bg-white/95 dark:bg-charcoal/50 px-8 py-7 text-slate-700 dark:text-slate-300 shadow-[0_30px_90px_rgba(15,23,42,0.12)]">
        <div className="flex items-center gap-4">
          <span className="neuro-loader neuro-loader-lg" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
              {eyebrow}
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{title}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [token, setToken] = useState(() => getStoredAccessToken())
  const [user, setUser] = useState(() => getCachedUser())
  const [booting, setBooting] = useState(() => hasStoredSession() && !getCachedUser())

  useEffect(() => {
    if (!hasStoredSession()) {
      setUser(null)
      setBooting(false)
      if (token) {
        setToken('')
      }
      return
    }

    let cancelled = false

    const loadUser = async () => {
      try {
        const profile = await getMe(token)
        if (!cancelled) {
          setToken(getStoredAccessToken())
          setUser(profile)
        }
      } catch {
        if (!cancelled) {
          clearSession()
          setToken('')
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setBooting(false)
        }
      }
    }

    loadUser()
    return () => {
      cancelled = true
    }
  }, [token])

  const handleAuthSuccess = (authResponse) => {
    persistSession(authResponse)
    setToken(authResponse.access_token)
    setUser(authResponse.user)
    setBooting(false)
  }

  const logout = () => {
    void logoutSession()
    setToken('')
    setUser(null)
  }

  if (booting) {
    return (
      <LoadingScreen
        eyebrow="Booting"
        title="Loading NeuroAI Pro"
        description="Restoring your session and preparing the workspace."
      />
    )
  }

  return (
    <Router>
      <AppLayout user={user} onLogout={logout}>
        <Suspense
          fallback={(
            <LoadingScreen
              eyebrow="Loading"
              title="Opening NeuroAI"
              description="Loading the next screen."
            />
          )}
        >
          <Routes>
            <Route
              path="/"
              element={token ? <Navigate to="/dashboard" replace /> : <Login onAuthSuccess={handleAuthSuccess} />}
            />
            <Route
              path="/signup"
              element={token ? <Navigate to="/dashboard" replace /> : <Signup onAuthSuccess={handleAuthSuccess} />}
            />
            <Route
              path="/dashboard"
              element={
                token && user ? (
                  <Dashboard token={token} user={user} setUser={setUser} onLogout={logout} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/privacy-policy" element={<PolicyPage policy={PRIVACY_POLICY} />} />
            <Route path="/terms-and-conditions" element={<PolicyPage policy={TERMS_POLICY} />} />
            <Route path="/refund-policy" element={<PolicyPage policy={REFUND_POLICY} />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </Router>
  )
}

export default App

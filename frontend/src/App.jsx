import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom'

import Login from './components/Login.jsx'
import Signup from './components/Signup.jsx'
import Dashboard from './components/Dashboard.jsx'
import { getMe } from './lib/api.js'

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(Boolean(localStorage.getItem('token')))

  useEffect(() => {
    if (!token) {
      setUser(null)
      setBooting(false)
      return
    }

    let cancelled = false

    const loadUser = async () => {
      try {
        const profile = await getMe(token)
        if (!cancelled) {
          setUser(profile)
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem('token')
          setToken(null)
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
    localStorage.setItem('token', authResponse.access_token)
    setToken(authResponse.access_token)
    setUser(authResponse.user)
    setBooting(false)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fafc,#eef2ff)]">
        <div className="rounded-[32px] border border-slate-200/80 bg-white/95 px-8 py-7 text-slate-700 shadow-[0_30px_90px_rgba(15,23,42,0.12)]">
          <div className="flex items-center gap-4">
            <span className="neuro-loader neuro-loader-lg" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Booting
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">Loading NeuroAI Pro</p>
              <p className="mt-1 text-sm text-slate-500">
                Restoring your session and preparing the workspace.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Router>
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
      </Routes>
    </Router>
  )
}

export default App

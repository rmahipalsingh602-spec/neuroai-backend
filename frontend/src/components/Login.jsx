import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { login, signup } from '../lib/api.js'
import PolicyLinks from './PolicyLinks.jsx'

export default function Login({ onAuthSuccess, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const isSignup = mode === 'signup'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')

    try {
      const response = isSignup
        ? await signup({ email, password })
        : await login({ email, password })
      onAuthSuccess(response)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(145deg,#020617,#172554_48%,#f8fafc_140%)] px-4 py-10">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.04),transparent)]" />
      <div className="relative grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="hidden rounded-[32px] border border-white/10 bg-white/5 p-10 text-white shadow-[0_30px_90px_rgba(15,23,42,0.55)] backdrop-blur lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-slate-300">NeuroAI Pro</p>
          <h1 className="mt-6 text-5xl font-semibold leading-tight">
            Private document AI, subscriptions, and usage control in one SaaS workspace.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
            Upload PDFs, DOCX, and TXT files. Chat with your knowledge base. Track free-plan usage and unlock Pro for Rs. 199.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Auth</p>
              <p className="mt-3 text-2xl font-semibold">JWT</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Usage</p>
              <p className="mt-3 text-2xl font-semibold">10 Free</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Plan</p>
              <p className="mt-3 text-2xl font-semibold">Pro Rs. 199</p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/50 bg-white/90 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.18)] backdrop-blur md:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-400">
            {isSignup ? 'Create Account' : 'Welcome Back'}
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
            {isSignup ? 'Start your NeuroAI Pro workspace' : 'Login to NeuroAI Pro'}
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Secure JWT auth, document upload, AI chat, and subscription-ready usage controls.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-primary focus:ring-4 focus:ring-blue-100"
                placeholder="founder@neuroai.pro"
                disabled={loading}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-primary focus:ring-4 focus:ring-blue-100"
                placeholder="Minimum 6 characters"
                minLength={6}
                disabled={loading}
                required
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="neuro-loader neuro-loader-sm"
                    style={{ borderColor: 'rgba(255,255,255,0.28)', borderTopColor: '#fff' }}
                    aria-hidden="true"
                  />
                  Please wait...
                </span>
              ) : isSignup ? (
                'Create Account'
              ) : (
                'Login'
              )}
            </button>
          </form>

          <p className="mt-4 text-xs leading-6 text-slate-500">
            By continuing, you agree to the current NeuroAI platform policies and billing terms.
          </p>
          <PolicyLinks className="mt-3" />

          <p className="mt-6 text-sm text-slate-600">
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => setMode(isSignup ? 'login' : 'signup')}
              className="font-semibold text-primary"
            >
              {isSignup ? 'Login' : 'Sign up'}
            </button>
          </p>

          <p className="mt-3 text-xs text-slate-400">
            Prefer separate routes? Use{' '}
            <Link to={isSignup ? '/' : '/signup'} className="font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4">
              {isSignup ? 'login page' : 'signup page'}
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

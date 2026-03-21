import { useEffect, useMemo, useState } from 'react'

import Chat from './Chat.jsx'
import Upload from './Upload.jsx'
import {
  createOrder,
  getAdminOverview,
  getDocuments,
  getMe,
  markOnboardingSeen,
  verifyPayment,
} from '../lib/api.js'
import { openCheckout } from '../lib/razorpay.js'

const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', short: 'DB' },
  { id: 'documents', label: 'My Documents', short: 'DOC' },
  { id: 'chat', label: 'AI Chat', short: 'AI' },
  { id: 'usage', label: 'Usage', short: 'USE' },
  { id: 'settings', label: 'Settings', short: 'CFG' },
]

const TOUR_STEPS = [
  {
    eyebrow: 'Step 1 of 4',
    title: 'Click here to upload your document',
    description: 'Start with PDF, DOCX, or TXT so NeuroAI can read and index it.',
    targetId: 'upload-dropzone-cta',
    view: 'documents',
  },
  {
    eyebrow: 'Step 2 of 4',
    title: 'Now go to AI Chat',
    description: 'Once your file is ready, open AI Chat and start asking questions.',
    targetId: 'nav-chat',
    view: 'documents',
  },
  {
    eyebrow: 'Step 3 of 4',
    title: 'Use smart suggestion buttons',
    description: 'Summarize, Key Points, and Explain help first-time users start instantly.',
    targetId: 'chat-quick-actions',
    view: 'chat',
  },
  {
    eyebrow: 'Step 4 of 4',
    title: 'Ask in your own words',
    description: 'Try prompts like "Summary batao" or "Main points kya hain".',
    targetId: 'chat-input-shell',
    view: 'chat',
  },
]

function formatInr(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount / 100)
}

function getTourCardStyle(targetRect) {
  if (!targetRect || typeof window === 'undefined') {
    return {
      left: '50%',
      top: '50%',
      width: 'min(360px, calc(100vw - 32px))',
      transform: 'translate(-50%, -50%)',
    }
  }

  const width = Math.min(window.innerWidth - 32, 360)
  const showAbove = targetRect.bottom + 280 > window.innerHeight && targetRect.top > 280
  const left = Math.min(
    Math.max(targetRect.left, 16),
    Math.max(16, window.innerWidth - width - 16),
  )
  const top = showAbove ? Math.max(16, targetRect.top - 236) : targetRect.bottom + 16

  return { left, top, width }
}

export default function Dashboard({ token, user, setUser, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [documents, setDocuments] = useState([])
  const [adminOverview, setAdminOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [banner, setBanner] = useState('')
  const [error, setError] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [tourTargetRect, setTourTargetRect] = useState(null)

  const usagePercent = useMemo(() => {
    if (user.is_pro) return 100
    if (!user.usage_limit) return 0
    return Math.min((user.usage_count / user.usage_limit) * 100, 100)
  }, [user])

  const activeTourStep = showOnboarding ? TOUR_STEPS[currentStep] : null
  const highlightedTargetId = activeTourStep?.targetId ?? null

  useEffect(() => {
    let cancelled = false

    const loadDashboard = async () => {
      setLoading(true)
      setError('')

      try {
        const [profile, documentResponse] = await Promise.all([getMe(token), getDocuments(token)])
        if (cancelled) return

        setUser(profile)
        setDocuments(documentResponse.documents)
        setShowOnboarding(!profile.has_seen_onboarding)
        setCurrentStep(0)

        if (profile.is_admin) {
          const adminData = await getAdminOverview(token)
          if (!cancelled) {
            setAdminOverview(adminData)
          }
        } else if (!cancelled) {
          setAdminOverview(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not load dashboard')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [token, setUser])

  useEffect(() => {
    if (!showOnboarding) {
      setTourTargetRect(null)
      return
    }

    const nextView = TOUR_STEPS[currentStep]?.view
    if (nextView && nextView !== activeTab) {
      setActiveTab(nextView)
    }
  }, [showOnboarding, currentStep, activeTab])

  useEffect(() => {
    if (!showOnboarding) {
      setTourTargetRect(null)
      return
    }

    const syncTarget = () => {
      const target = document.getElementById(TOUR_STEPS[currentStep].targetId)
      if (!target) {
        setTourTargetRect(null)
        return
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      const rect = target.getBoundingClientRect()
      setTourTargetRect({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      })
    }

    const timer = window.setTimeout(syncTarget, 140)
    window.addEventListener('resize', syncTarget)
    window.addEventListener('scroll', syncTarget, true)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', syncTarget)
      window.removeEventListener('scroll', syncTarget, true)
    }
  }, [showOnboarding, currentStep, activeTab, documents.length])

  const refreshProfile = async () => {
    const profile = await getMe(token)
    setUser(profile)
    if (profile.is_admin) {
      const adminData = await getAdminOverview(token)
      setAdminOverview(adminData)
    }
    return profile
  }

  const handleUpgrade = async () => {
    setPaymentLoading(true)
    setBanner('')
    setError('')

    try {
      const order = await createOrder(token)
      const checkoutResponse = await openCheckout({ order, user })
      const verification = await verifyPayment(token, checkoutResponse)
      setUser(verification.user)
      setBanner('NeuroAI Pro activated successfully.')
      await refreshProfile()
    } catch (err) {
      setError(err.message || 'Upgrade flow failed')
    } finally {
      setPaymentLoading(false)
    }
  }

  const handleDocumentUploaded = (document) => {
    setDocuments((current) => [document, ...current])
    refreshProfile().catch(() => {})
    setBanner(`${document.file_name} uploaded and indexed.`)

    if (showOnboarding && currentStep === 0) {
      setCurrentStep(1)
    }
  }

  const handleUserUpdated = (nextUser) => {
    setUser(nextUser)
    refreshProfile().catch(() => {})
  }

  const handleAuthError = () => {
    setError('Your session expired. Please login again.')
    onLogout()
  }

  const handleLimitReached = async (err) => {
    setError(err.message || 'Free plan limit reached.')
    window.alert('Free limit reached. Upgrade to NeuroAI Pro for unlimited queries.')
    try {
      await refreshProfile()
    } catch {
      // Session handling already covered elsewhere.
    }
  }

  const handleOnboardingDismiss = async () => {
    try {
      const updatedUser = await markOnboardingSeen(token)
      setUser(updatedUser)
    } catch (err) {
      setError(err.message || 'Could not save onboarding progress.')
    } finally {
      setShowOnboarding(false)
      setCurrentStep(0)
      setTourTargetRect(null)
    }
  }

  const handleOnboardingNext = () => {
    if (currentStep >= TOUR_STEPS.length - 1) {
      handleOnboardingDismiss()
      return
    }
    setCurrentStep((step) => step + 1)
  }

  const renderOverview = () => (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/60 bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(30,41,59,0.96))] p-8 text-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="inline-flex rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
              NeuroAI Workspace
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">
              Smart document AI that feels polished from the first click.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Upload files, ask structured questions, use smart starters, and move into a Pro flow
              when you want unlimited power.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('documents')}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Upload Documents
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Open AI Chat
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[460px]">
            <HeroStat label="Plan" value={user.is_pro ? 'Pro Active' : 'Free'} />
            <HeroStat label="Queries Left" value={user.is_pro ? 'Unlimited' : `${user.remaining_queries}`} />
            <HeroStat label="Documents" value={`${documents.length}`} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.95fr]">
        <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">How to Use</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <PanelInfo title="Upload" text="Bring in PDFs, DOCX, or TXT and build your private knowledge base." />
            <PanelInfo title="Ask Fast" text="Use smart actions like Summarize, Key Points, and Explain." />
            <PanelInfo title="Stay Clear" text="NeuroAI is tuned to answer in a structured, easy-to-read style." />
            <PanelInfo title="Upgrade Later" text="Free users can explore first and upgrade when they need more." />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Current Focus</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              {documents.length ? 'Your workspace is ready.' : 'Start your AI journey.'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {documents.length
                ? 'Open AI Chat and use the smart starters to get your first answer quickly.'
                : 'Upload your first document and unlock summaries, key points, and explanations.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setActiveTab(documents.length ? 'chat' : 'documents')}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {documents.length ? 'Open AI Chat' : 'Upload Now'}
              </button>
              {!user.is_pro ? (
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={paymentLoading}
                  className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Upgrade to Pro
                </button>
              ) : null}
            </div>
          </div>

          {user.is_admin && adminOverview ? (
            <div className="rounded-[28px] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Admin Snapshot</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <AdminStat label="Users" value={`${adminOverview.total_users}`} />
                <AdminStat label="Pro Users" value={`${adminOverview.pro_users}`} />
                <AdminStat label="Revenue" value={formatInr(adminOverview.total_revenue)} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  const renderDocuments = () => (
    <div className="space-y-6">
      {!documents.length ? (
        <section className="rounded-[32px] border border-sky-100 bg-[linear-gradient(135deg,#eff6ff,#ffffff)] p-8 shadow-[0_24px_70px_rgba(59,130,246,0.08)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600">No Document Yet</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
            Start your AI journey
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Upload your first document and unlock AI power.
          </p>
          <button
            type="button"
            onClick={() => document.getElementById('file-upload')?.click()}
            className="mt-6 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Upload Now
          </button>
        </section>
      ) : null}

      <Upload
        token={token}
        documents={documents}
        onDocumentUploaded={handleDocumentUploaded}
        onAuthError={handleAuthError}
        tourTargetId="upload-dropzone-cta"
        tourActive={highlightedTargetId === 'upload-dropzone-cta'}
      />
    </div>
  )

  const renderUsage = () => (
    <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Usage Analytics</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <MetricCard label="Queries Used" value={`${user.usage_count}`} />
          <MetricCard label="Remaining" value={user.is_pro ? 'Unlimited' : `${user.remaining_queries}`} />
          <MetricCard label="Plan" value={user.is_pro ? 'Pro Active' : 'Free'} />
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Plan Experience</p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900">
          {user.is_pro ? 'You are running at full power' : 'Upgrade to Pro for unlimited power'}
        </h3>
        <ul className="mt-6 space-y-3 text-sm text-slate-700">
          <li className="rounded-2xl bg-slate-50 px-4 py-3">Unlimited AI questions</li>
          <li className="rounded-2xl bg-slate-50 px-4 py-3">Faster responses</li>
          <li className="rounded-2xl bg-slate-50 px-4 py-3">Advanced insights</li>
        </ul>
      </div>
    </div>
  )

  const renderSettings = () => (
    <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Account</p>
        <div className="mt-8 space-y-4">
          <SettingRow label="Email" value={user.email} />
          <SettingRow label="Plan" value={user.is_pro ? 'NeuroAI Pro' : 'Free'} />
          <SettingRow label="Usage Month" value={user.usage_month} />
          <SettingRow label="Documents Indexed" value={`${documents.length}`} />
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Session</p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900">Manage access</h3>
        <button
          onClick={onLogout}
          className="mt-8 w-full rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100"
        >
          Logout
        </button>
      </div>
    </div>
  )

  const renderActiveTab = () => {
    if (activeTab === 'documents') return renderDocuments()
    if (activeTab === 'chat') {
      return (
        <Chat
          token={token}
          user={user}
          documentCount={documents.length}
          onUserUpdated={handleUserUpdated}
          onUpgrade={handleUpgrade}
          onAuthError={handleAuthError}
          onLimitReached={handleLimitReached}
          onOpenDocuments={() => setActiveTab('documents')}
          highlightTargetId={highlightedTargetId}
        />
      )
    }
    if (activeTab === 'usage') return renderUsage()
    if (activeTab === 'settings') return renderSettings()
    return renderOverview()
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fafc,#eef2ff)]">
        <div className="rounded-[32px] border border-slate-200/80 bg-white/95 px-8 py-7 text-slate-700 shadow-[0_30px_90px_rgba(15,23,42,0.12)]">
          <div className="flex items-center gap-4">
            <span className="neuro-loader neuro-loader-lg" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Loading Dashboard
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                Preparing your NeuroAI Pro workspace
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Fetching your profile, documents, and plan details.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_28%),linear-gradient(180deg,#f8fafc,#eef2ff_55%,#f8fafc)]">
      <aside className="w-full border-b border-slate-200/80 bg-[#0b1120] px-5 py-5 text-white md:fixed md:inset-y-0 md:left-0 md:w-64 md:border-b-0 md:border-r md:border-white/10 md:px-6 md:py-8">
        <div className="flex items-center justify-between md:block">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Workspace</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">NeuroAI Pro</h2>
            <span
              className={`mt-4 inline-flex rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                user.is_pro ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-slate-200'
              }`}
            >
              {user.is_pro ? 'Pro Active' : 'Free Plan'}
            </span>
          </div>
          {!user.is_pro ? (
            <button
              onClick={handleUpgrade}
              disabled={paymentLoading}
              className="hidden rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 disabled:opacity-60 md:inline-flex"
            >
              Upgrade
            </button>
          ) : null}
        </div>

        <nav className="mt-6 flex gap-2 overflow-x-auto pb-1 md:mt-10 md:block md:space-y-2 md:overflow-visible">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id
            const isTourTarget = highlightedTargetId === `nav-${item.id}`

            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`flex min-w-fit items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-all md:w-full ${
                  isActive
                    ? 'bg-white text-slate-950 shadow-[0_16px_36px_rgba(255,255,255,0.12)]'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                } ${
                  isTourTarget
                    ? 'neuro-tour-pulse ring-4 ring-amber-300 ring-offset-2 ring-offset-[#0b1120]'
                    : ''
                }`}
              >
                <span className="rounded-full bg-slate-900/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]">
                  {item.short}
                </span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 md:mt-10">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Usage</p>
          <p className="mt-3 text-sm text-slate-300">
            {user.is_pro ? 'Unlimited Pro queries' : `Free limit: ${user.usage_limit} queries`}
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            {user.is_pro ? 'Plan active' : `Used: ${user.usage_count} / ${user.usage_limit}`}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#fbbf24,#fb923c)] transition-all duration-500"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
      </aside>

      <main className="px-4 py-6 md:ml-64 md:px-8 md:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/50 bg-white/70 px-6 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">NeuroAI Dashboard</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                Smart, fast, helpful AI for your docs
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('documents')}
                className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Open Documents
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Open AI Chat
              </button>
            </div>
          </div>

          {user.is_pro ? (
            <div className="mb-4 rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5,#d1fae5)] px-6 py-5 shadow-[0_20px_60px_rgba(16,185,129,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Pro Mode Active</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                Unlimited queries, faster AI, and advanced insights are enabled.
              </p>
            </div>
          ) : (
            <div className="mb-4 flex flex-col gap-4 rounded-[28px] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed,#fffbeb)] px-6 py-5 shadow-[0_20px_60px_rgba(245,158,11,0.12)] md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">Free Plan</p>
                <p className="mt-2 text-xl font-semibold text-slate-900">Upgrade to Pro for unlimited power</p>
                <p className="mt-1 text-sm text-slate-600">
                  {user.remaining_queries} free queries left this month.
                </p>
              </div>
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={paymentLoading}
                className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paymentLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="neuro-loader neuro-loader-sm"
                      style={{ borderColor: 'rgba(255,255,255,0.28)', borderTopColor: '#fff' }}
                      aria-hidden="true"
                    />
                    Starting checkout...
                  </span>
                ) : (
                  'Upgrade Rs. 199'
                )}
              </button>
            </div>
          )}

          {banner ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {banner}
            </div>
          ) : null}
          {error ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}

          {renderActiveTab()}
        </div>
      </main>

      {showOnboarding ? (
        <OnboardingOverlay
          currentStep={currentStep}
          step={activeTourStep}
          targetRect={tourTargetRect}
          onNext={handleOnboardingNext}
          onSkip={handleOnboardingDismiss}
          onComplete={handleOnboardingDismiss}
        />
      ) : null}
    </div>
  )
}

function OnboardingOverlay({ currentStep, step, targetRect, onNext, onSkip, onComplete }) {
  const highlightStyle = targetRect
    ? {
        top: targetRect.top - 10,
        left: targetRect.left - 10,
        width: targetRect.width + 20,
        height: targetRect.height + 20,
      }
    : null

  return (
    <>
      {highlightStyle ? (
        <div
          className="pointer-events-none fixed z-[70] rounded-[28px] ring-4 ring-amber-300 transition-all duration-300"
          style={{ ...highlightStyle, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.58)' }}
        />
      ) : (
        <div className="fixed inset-0 z-[70] bg-slate-950/60" />
      )}

      <div
        className="fixed z-[75] rounded-[28px] border border-white/40 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.28)] backdrop-blur"
        style={getTourCardStyle(targetRect)}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">{step.eyebrow}</p>
        <h3 className="mt-3 text-2xl font-semibold text-slate-900">{step.title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">{step.description}</p>
        <div className="mt-5 flex items-center gap-2">
          {TOUR_STEPS.map((tourStep, index) => (
            <span
              key={tourStep.targetId}
              className={`h-2.5 rounded-full transition-all ${
                index === currentStep ? 'w-8 bg-slate-950' : 'w-2.5 bg-slate-300'
              }`}
            />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={currentStep < TOUR_STEPS.length - 1 ? onNext : onComplete}
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {currentStep < TOUR_STEPS.length - 1 ? 'Next' : 'Got it'}
          </button>
        </div>
      </div>
    </>
  )
}

function HeroStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-300">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function PanelInfo({ title, text }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

function AdminStat({ label, value }) {
  return (
    <div>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function SettingRow({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}

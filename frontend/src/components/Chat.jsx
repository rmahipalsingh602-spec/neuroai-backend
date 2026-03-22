import { useEffect, useRef, useState } from 'react'

import { generateVoiceAudio, sendChat } from '../lib/api.js'
import {
  cacheVoiceAudio,
  createVoiceCacheKey,
  detectVoiceLanguage,
  releaseVoiceCache,
  speakWithBrowserVoice,
  stopBrowserVoice,
} from '../lib/voice.js'

const SMART_ACTIONS = [
  {
    id: 'summarize',
    label: 'Summarize',
    prompt: 'Summarize the uploaded document in simple bullet points.',
  },
  {
    id: 'key-points',
    label: 'Key Points',
    prompt: 'Give me the main points from the uploaded document.',
  },
  {
    id: 'explain',
    label: 'Explain',
    prompt: 'Explain the uploaded document in clear and simple language.',
  },
]

const EXAMPLE_QUESTIONS = [
  'Summary batao',
  'Main points kya hain',
  'Explain this in simple words',
]

const LANGUAGE_LABELS = {
  hi: 'Hindi',
  en: 'English',
  fr: 'French',
  es: 'Spanish',
}

export default function Chat({
  token,
  user,
  documentCount = 0,
  onUserUpdated,
  onUpgrade,
  onAuthError,
  onLimitReached,
  onOpenDocuments,
  highlightTargetId,
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [voiceActiveMessageId, setVoiceActiveMessageId] = useState(null)
  const [voiceMetaByMessageId, setVoiceMetaByMessageId] = useState({})
  const [voiceError, setVoiceError] = useState('')
  const [listening, setListening] = useState(false)
  const bottomRef = useRef(null)
  const audioRef = useRef(null)
  const voiceAbortRef = useRef(null)
  const voiceCacheRef = useRef(new Map())
  const voiceSessionRef = useRef(0)
  const isMountedRef = useRef(true)
  const autoPlayedMessageIdRef = useRef(null)
  const handlePlayVoiceRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const voiceCache = voiceCacheRef.current

    return () => {
      isMountedRef.current = false
      stopBrowserVoice()
      voiceAbortRef.current?.abort()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current.onended = null
        audioRef.current.onerror = null
      }
      releaseVoiceCache(voiceCache)
    }
  }, [])

  const isBlocked = !user.is_pro && user.usage_count >= user.usage_limit
  const hasDocuments = documentCount > 0
  const hasConversation = messages.some((message) => message.role === 'user')
  const showWelcomeState = !hasConversation && messages.length === 0

  const setVoiceMeta = (messageId, nextMeta) => {
    if (!isMountedRef.current) return

    setVoiceMetaByMessageId((current) => ({
      ...current,
      [messageId]: {
        ...current[messageId],
        ...nextMeta,
      },
    }))
  }

  const clearAudioPlayback = (clearActiveMessage = true) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current = null
    }
    if (isMountedRef.current && clearActiveMessage) {
      setVoiceActiveMessageId(null)
    }
  }

  const cancelVoiceRequest = () => {
    if (voiceAbortRef.current) {
      voiceAbortRef.current.abort()
      voiceAbortRef.current = null
    }
  }

  const resetVoiceSession = (clearActiveMessage = true) => {
    voiceSessionRef.current += 1
    cancelVoiceRequest()
    stopBrowserVoice()
    clearAudioPlayback(clearActiveMessage)
    return voiceSessionRef.current
  }

  // 🎤 VOICE INPUT
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      window.alert('Speech Recognition not supported in your browser')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = window.navigator.language || 'en-US'
    recognition.continuous = false
    recognition.interimResults = false

    setListening(true)

    recognition.start()

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript
      setInput(text)
      handleSend(text) // auto send
    }

    recognition.onerror = () => {
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }
  }

  const handleSend = async (overrideQuestion) => {
    const question = (overrideQuestion ?? input).trim()
    if (!question || loading || isBlocked) return

    if (!hasDocuments) {
      onOpenDocuments?.()
      return
    }

    setInput('')
    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: question,
        sources: [],
      },
    ])
    setLoading(true)

    try {
      const response = await sendChat(token, question)
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.response,
          sources: response.sources,
        },
      ])
      onUserUpdated(response.user)
    } catch (err) {
      if (err.code === 'AUTH_ERROR') {
        onAuthError?.()
        return
      }
      if (err.code === 'LIMIT_REACHED') {
        onLimitReached?.(err)
      }
      if (err.code === 'FILE_ERROR') {
        onOpenDocuments?.()
      }
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: err.message || 'Unable to complete AI chat right now.',
          sources: [],
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAction = async (prompt) => {
    if (!hasDocuments) {
      onOpenDocuments?.()
      return
    }

    await handleSend(prompt)
  }

  const playAudioFromUrl = async (audioUrl, sessionId) => {
    if (voiceSessionRef.current !== sessionId) return

    const audio = new globalThis.Audio(audioUrl)
    audio.preload = 'auto'

    audioRef.current = audio
    audio.onended = () => {
      if (voiceSessionRef.current !== sessionId) return
      clearAudioPlayback()
    }
    audio.onerror = () => {
      if (voiceSessionRef.current !== sessionId) return
      resetVoiceSession()
      if (isMountedRef.current) {
        setVoiceError('Voice playback failed for this message.')
      }
    }

    await audio.play()
  }

  const playFallbackVoice = async (message, languageProfile, sessionId) => {
    const cacheKey = createVoiceCacheKey(message.content, languageProfile.outputLanguage)
    const cachedEntry = voiceCacheRef.current.get(cacheKey)

    if (cachedEntry) {
      setVoiceMeta(message.id, {
        sourceLanguage: cachedEntry.sourceLanguage,
        outputLanguage: cachedEntry.outputLanguage,
        mode: 'cache',
      })
      await playAudioFromUrl(cachedEntry.audioUrl, sessionId)
      return
    }

    const abortController = new globalThis.AbortController()
    voiceAbortRef.current = abortController

    try {
      const voiceResponse = await generateVoiceAudio(
        message.content,
        languageProfile.outputLanguage,
        abortController.signal,
      )
      if (abortController.signal.aborted || voiceSessionRef.current !== sessionId) {
        return
      }

      const cachedAudio = {
        audioUrl: globalThis.URL.createObjectURL(voiceResponse.blob),
        sourceLanguage: voiceResponse.sourceLanguage || languageProfile.sourceLanguage,
        outputLanguage: voiceResponse.outputLanguage || languageProfile.outputLanguage,
      }

      cacheVoiceAudio(voiceCacheRef.current, cacheKey, cachedAudio)
      setVoiceMeta(message.id, {
        sourceLanguage: cachedAudio.sourceLanguage,
        outputLanguage: cachedAudio.outputLanguage,
        mode: voiceResponse.cacheStatus === 'hit' ? 'cache' : 'server',
      })

      await playAudioFromUrl(cachedAudio.audioUrl, sessionId)
    } finally {
      if (voiceAbortRef.current === abortController) {
        voiceAbortRef.current = null
      }
    }
  }

  const failVoicePlayback = (sessionId, error) => {
    if (voiceSessionRef.current !== sessionId) return

    resetVoiceSession()
    if (isMountedRef.current) {
      setVoiceError(error?.message || 'Unable to play voice right now.')
    }
  }

  const handlePlayVoice = async (message) => {
    if (!message.content?.trim()) return

    if (voiceActiveMessageId === message.id) {
      resetVoiceSession()
      setVoiceError('')
      return
    }

    const languageProfile = detectVoiceLanguage(message.content)
    const sessionId = resetVoiceSession(false)

    setVoiceError('')
    if (isMountedRef.current) {
      setVoiceActiveMessageId(message.id)
    }
    setVoiceMeta(message.id, {
      sourceLanguage: languageProfile.sourceLanguage,
      outputLanguage: languageProfile.outputLanguage,
      mode: 'browser',
    })

    let browserStarted = false
    const browserPlayback = speakWithBrowserVoice(message.content, languageProfile, {
      onStart: () => {
        if (voiceSessionRef.current !== sessionId) return
        browserStarted = true
        setVoiceMeta(message.id, {
          sourceLanguage: languageProfile.sourceLanguage,
          outputLanguage: languageProfile.outputLanguage,
          mode: 'browser',
        })
      },
      onEnd: () => {
        if (voiceSessionRef.current !== sessionId) return
        clearAudioPlayback()
      },
      onError: (error) => {
        if (voiceSessionRef.current !== sessionId) return

        if (!browserStarted) {
          void playFallbackVoice(message, languageProfile, sessionId).catch((fallbackError) => {
            if (fallbackError?.name === 'AbortError') {
              return
            }

            globalThis.console.error('VOICE ERROR:', fallbackError)
            failVoicePlayback(sessionId, fallbackError)
          })
          return
        }

        globalThis.console.error('VOICE ERROR:', error)
        failVoicePlayback(sessionId, error)
      },
    })

    if (browserPlayback) {
      return
    }

    try {
      await playFallbackVoice(message, languageProfile, sessionId)
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }

      globalThis.console.error('VOICE ERROR:', error)
      failVoicePlayback(sessionId, error)
    }
  }

  handlePlayVoiceRef.current = handlePlayVoice

  useEffect(() => {
    if (!messages.length || voiceActiveMessageId || loading) {
      return
    }

    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role !== 'assistant') {
      return
    }

    if (autoPlayedMessageIdRef.current === lastMessage.id) {
      return
    }

    autoPlayedMessageIdRef.current = lastMessage.id
    void handlePlayVoiceRef.current?.(lastMessage)
  }, [loading, messages, voiceActiveMessageId])

  const getVoiceMetaLabel = (messageId) => {
    const meta = voiceMetaByMessageId[messageId]
    if (!meta) {
      return 'Auto-detect Hindi or English. Browser voice first, server fallback only when needed.'
    }

    const sourceLabel = LANGUAGE_LABELS[meta.sourceLanguage] || 'detected language'
    const outputLabel = LANGUAGE_LABELS[meta.outputLanguage] || sourceLabel
    const playbackLabel = (
      meta.mode === 'browser'
        ? 'browser voice'
        : meta.mode === 'cache'
          ? 'cached audio'
          : 'fallback audio'
    )

    if (voiceActiveMessageId === messageId) {
      return `Detected ${sourceLabel}. Playing ${outputLabel} via ${playbackLabel}.`
    }

    return `Detected ${sourceLabel}. ${outputLabel} ready via ${playbackLabel}.`
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">AI Chat</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">NeuroAI assistant</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Smart, fast, and helpful answers for your private documents with clear structure and
              better follow-up prompts.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div
              className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
                user.is_pro
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {user.is_pro ? 'Pro Active' : 'Free Plan'}
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Voice Playback
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                <span className="rounded-full bg-white px-3 py-2 shadow-sm">Browser first</span>
                <span className="rounded-full bg-white px-3 py-2 shadow-sm">Hindi auto</span>
                <span className="rounded-full bg-white px-3 py-2 shadow-sm">English auto</span>
                <span className="rounded-full bg-white px-3 py-2 shadow-sm">Server fallback</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Instant playback uses native browser voice first. Backend audio runs only when the
                browser cannot speak the message.
              </p>
            </div>
          </div>
        </div>

        {user.is_pro ? (
          <div className="mt-5 rounded-[24px] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5,#d1fae5)] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Pro Mode Active
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              Unlimited queries. Faster AI. Advanced insights enabled.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-emerald-700">
              <span className="rounded-full bg-white px-3 py-2">Unlimited queries</span>
              <span className="rounded-full bg-white px-3 py-2">Faster responses</span>
              <span className="rounded-full bg-white px-3 py-2">Deeper document understanding</span>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4 rounded-[24px] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed,#fffbeb)] px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">
                Upgrade Available
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                Upgrade to Pro for unlimited power
              </p>
              <p className="mt-1 text-sm text-slate-600">
                You have {user.remaining_queries} free queries left this month.
              </p>
            </div>
            <button
              onClick={onUpgrade}
              disabled={loading}
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Upgrade Rs. 199
            </button>
          </div>
        )}
      </div>

      <div className="chat-box flex h-[620px] flex-col bg-[linear-gradient(180deg,#f8fafc,#eef2ff)]">
        <div className="neuro-scrollbar flex-1 overflow-y-auto p-5">
          {voiceError ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {voiceError}
            </div>
          ) : null}

          {showWelcomeState ? (
            <div className="neuro-rise-in rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
                    Welcome to NeuroAI
                  </p>
                  <h3 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                    I can help you understand your documents instantly.
                  </h3>
                  <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <p className="text-sm font-semibold text-slate-900">Start here</p>
                    <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                      <li>1. Upload your document.</li>
                      <li>2. Ask me anything about it.</li>
                    </ol>
                  </div>

                  <div className="mt-5">
                    <p className="text-sm font-semibold text-slate-900">Try asking</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {EXAMPLE_QUESTIONS.map((question) => (
                        <button
                          key={question}
                          type="button"
                          onClick={() => setInput(question)}
                          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="xl:w-[360px]">
                  <div
                    id="chat-quick-actions"
                    className={`rounded-[28px] border p-5 transition-all ${
                      highlightTargetId === 'chat-quick-actions'
                        ? 'neuro-tour-pulse border-amber-300 bg-amber-50 shadow-[0_24px_70px_rgba(251,191,36,0.18)]'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Smart AI Starters
                    </p>
                    <div className="mt-4 grid gap-3">
                      {SMART_ACTIONS.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => handleQuickAction(action.prompt)}
                          disabled={loading || isBlocked}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                    {!hasDocuments ? (
                      <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                        Upload a document first, then these actions can run instantly.
                        <button
                          type="button"
                          onClick={onOpenDocuments}
                          className="mt-3 inline-flex rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800"
                        >
                          Open Upload
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`message max-w-xs px-4 py-3 text-sm leading-6 shadow lg:max-w-2xl ${
                    message.role === 'user'
                      ? 'bg-slate-950 text-white'
                      : 'border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <p className="whitespace-pre-line">{message.content}</p>
                  {message.sources?.length ? (
                    <div className="mt-4 space-y-2 border-t border-slate-200/70 pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Sources
                      </p>
                      {message.sources.map((source) => (
                        <div
                          key={`${message.id}-${source.document_id}`}
                          className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600"
                        >
                          <p className="font-semibold text-slate-700">{source.file_name}</p>
                          <p className="mt-1 leading-5">{source.excerpt}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div
                    className={`mt-4 flex flex-wrap items-center gap-3 ${
                      message.sources?.length ? 'border-t border-slate-200/70 pt-3' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handlePlayVoice(message)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        message.role === 'user'
                          ? 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                          : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {voiceActiveMessageId === message.id ? 'Stop Voice' : 'Play Voice'}
                    </button>
                    <span
                      className={`text-[11px] font-medium ${
                        message.role === 'user' ? 'text-white/70' : 'text-slate-500'
                      }`}
                    >
                      {getVoiceMetaLabel(message.id)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start">
                <div className="message inline-flex items-center gap-2 border border-slate-200 bg-white px-4 py-3 shadow">
                  <span className="typing-dot" />
                  <span className="typing-dot [animation-delay:150ms]" />
                  <span className="typing-dot [animation-delay:300ms]" />
                </div>
              </div>
            ) : null}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white p-4">
        {isBlocked ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Free plan limit reached. Upgrade to NeuroAI Pro for unlimited chat.
            <button
              onClick={onUpgrade}
              className="ml-3 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800"
            >
              Upgrade Rs. 199
            </button>
          </div>
        ) : null}

        <div
          id="chat-input-shell"
          className={`rounded-[24px] border border-slate-200 bg-slate-50 p-3 transition-all ${
            highlightTargetId === 'chat-input-shell'
              ? 'neuro-tour-pulse border-amber-300 bg-amber-50 shadow-[0_24px_70px_rgba(251,191,36,0.18)]'
              : ''
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-2">
            <div className="flex flex-1 flex-col gap-3 md:flex-row">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSend()
                  }
                }}
                placeholder={
                  hasDocuments
                    ? 'Ask about any uploaded document... (or click 🎤)'
                    : 'Upload a document first to unlock AI answers...'
                }
                className="flex-1 rounded-2xl border border-gray-300 bg-white px-4 py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={loading || isBlocked || !hasDocuments}
              />
              <button
                onClick={hasDocuments ? () => handleSend() : onOpenDocuments}
                disabled={loading || isBlocked || (hasDocuments && !input.trim())}
                className="hidden md:inline-flex rounded-2xl bg-primary px-6 py-3 font-semibold text-white transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 w-full md:w-auto justify-center"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="neuro-loader neuro-loader-sm"
                      style={{ borderColor: 'rgba(255,255,255,0.28)', borderTopColor: '#fff' }}
                      aria-hidden="true"
                    />
                    Thinking...
                  </span>
                ) : hasDocuments ? (
                  'Send'
                ) : (
                  'Open Upload'
                )}
              </button>
            </div>
            {/* 🎤 MIC BUTTON */}
            <button
              onClick={startListening}
              disabled={loading || isBlocked || !hasDocuments || listening}
              className={`rounded-full p-3 shadow-lg shadow-slate-900/25 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${listening ? 'bg-red-500 shadow-lg shadow-red-500/50 scale-105 ring-2 ring-red-300/50' : 'bg-slate-900 hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/50 text-white'}`}
              title={listening ? 'Listening...' : 'Speak now (auto Hindi/English)'}
            >
              {listening ? '🎙️ Listening...' : '🎤 Speak'}
            </button>
            <button
              onClick={hasDocuments ? () => handleSend() : onOpenDocuments}
              disabled={loading || isBlocked || (hasDocuments && !input.trim())}
              className="md:hidden rounded-2xl bg-primary px-6 py-3 font-semibold text-white transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 w-full"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="neuro-loader neuro-loader-sm"
                    style={{ borderColor: 'rgba(255,255,255,0.28)', borderTopColor: '#fff' }}
                    aria-hidden="true"
                  />
                  Thinking...
                </span>
              ) : hasDocuments ? (
                'Send'
              ) : (
                'Open Upload'
              )}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            NeuroAI responds clearly and uses bullet points when it helps. Voice input auto-detects Hindi/English.
          </p>
        </div>
      </div>
    </div>
  )
}

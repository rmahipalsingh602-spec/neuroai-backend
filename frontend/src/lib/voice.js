const DEVANAGARI_REGEX = /[\u0900-\u097f]/
const DEFAULT_CACHE_LIMIT = 24

function normalizeVoiceText(text = '') {
  return text.replace(/\s+/g, ' ').trim()
}

function getSpeechSynthesisInstance() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null
  }

  return window.speechSynthesis
}

function pickPreferredVoice(voices, languageProfile) {
  if (!voices.length) {
    return null
  }

  const preferredLocales = languageProfile.isHindi
    ? ['hi-in', 'hi']
    : ['en-in', 'en-us', 'en-gb', 'en']

  const exactMatch = voices.find((voice) =>
    preferredLocales.includes((voice.lang || '').toLowerCase()),
  )
  if (exactMatch) {
    return exactMatch
  }

  return (
    voices.find((voice) => {
      const voiceLanguage = (voice.lang || '').toLowerCase()
      return preferredLocales.some((locale) => voiceLanguage.startsWith(locale))
    }) || null
  )
}

export function detectVoiceLanguage(text = '') {
  const normalizedText = normalizeVoiceText(text)
  const isHindi = DEVANAGARI_REGEX.test(normalizedText)

  return {
    isHindi,
    locale: isHindi ? 'hi-IN' : 'en-US',
    sourceLanguage: isHindi ? 'hi' : 'en',
    outputLanguage: isHindi ? 'hi' : 'en',
  }
}

export function createVoiceCacheKey(text, outputLanguage) {
  return `${outputLanguage}:${normalizeVoiceText(text)}`
}

export function cacheVoiceAudio(cacheMap, cacheKey, entry, maxEntries = DEFAULT_CACHE_LIMIT) {
  if (cacheMap.has(cacheKey)) {
    const existingEntry = cacheMap.get(cacheKey)
    if (existingEntry?.audioUrl && existingEntry.audioUrl !== entry.audioUrl) {
      globalThis.URL.revokeObjectURL(existingEntry.audioUrl)
    }
    cacheMap.delete(cacheKey)
  }

  cacheMap.set(cacheKey, entry)

  while (cacheMap.size > maxEntries) {
    const oldestEntry = cacheMap.entries().next().value
    if (!oldestEntry) {
      break
    }

    const [oldestKey, oldestValue] = oldestEntry
    cacheMap.delete(oldestKey)
    if (oldestValue?.audioUrl) {
      globalThis.URL.revokeObjectURL(oldestValue.audioUrl)
    }
  }
}

export function releaseVoiceCache(cacheMap) {
  for (const cachedEntry of cacheMap.values()) {
    if (cachedEntry?.audioUrl) {
      globalThis.URL.revokeObjectURL(cachedEntry.audioUrl)
    }
  }

  cacheMap.clear()
}

export function stopBrowserVoice() {
  const synthesis = getSpeechSynthesisInstance()
  synthesis?.cancel()
}

export function speakWithBrowserVoice(text, languageProfile, callbacks = {}) {
  const synthesis = getSpeechSynthesisInstance()
  if (!synthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
    return null
  }

  const normalizedText = normalizeVoiceText(text)
  if (!normalizedText) {
    return null
  }

  const utterance = new window.SpeechSynthesisUtterance(normalizedText)
  utterance.lang = languageProfile.locale

  const preferredVoice = pickPreferredVoice(synthesis.getVoices(), languageProfile)
  if (preferredVoice) {
    utterance.voice = preferredVoice
  }

  utterance.onstart = () => {
    callbacks.onStart?.({
      voiceName: preferredVoice?.name || '',
    })
  }

  utterance.onend = () => {
    callbacks.onEnd?.()
  }

  utterance.onerror = (event) => {
    if (event.error === 'canceled' || event.error === 'interrupted') {
      return
    }

    callbacks.onError?.(
      new Error(event.error ? `Browser voice failed (${event.error}).` : 'Browser voice failed.'),
    )
  }

  try {
    synthesis.cancel()
    synthesis.speak(utterance)
  } catch (error) {
    callbacks.onError?.(
      error instanceof Error ? error : new Error('Browser voice failed.'),
    )
    return null
  }

  return {
    cancel: () => synthesis.cancel(),
    voiceName: preferredVoice?.name || '',
  }
}

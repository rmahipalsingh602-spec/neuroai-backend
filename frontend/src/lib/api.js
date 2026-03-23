const DEFAULT_API_BASE = 'https://neuroai-backend-0gl2.onrender.com'
const API_BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '')
const VOICE_REQUEST_TIMEOUT_MS = 45000
const ACCESS_TOKEN_STORAGE_KEY = 'neuroai_access_token'
const REFRESH_TOKEN_STORAGE_KEY = 'neuroai_refresh_token'
const LEGACY_ACCESS_TOKEN_STORAGE_KEY = 'token'

function getStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

export function getStoredAccessToken() {
  const storage = getStorage()
  return (
    storage?.getItem(ACCESS_TOKEN_STORAGE_KEY)
    || storage?.getItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY)
    || ''
  )
}

export function getStoredRefreshToken() {
  return getStorage()?.getItem(REFRESH_TOKEN_STORAGE_KEY) || ''
}

export function hasStoredSession() {
  return Boolean(getStoredAccessToken() || getStoredRefreshToken())
}

export function persistSession(authResponse) {
  const storage = getStorage()
  if (!storage || !authResponse) {
    return authResponse
  }

  if (authResponse.access_token) {
    storage.setItem(ACCESS_TOKEN_STORAGE_KEY, authResponse.access_token)
    storage.setItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY, authResponse.access_token)
  }
  if (authResponse.refresh_token) {
    storage.setItem(REFRESH_TOKEN_STORAGE_KEY, authResponse.refresh_token)
  }

  return authResponse
}

export function clearSession() {
  const storage = getStorage()
  storage?.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  storage?.removeItem(REFRESH_TOKEN_STORAGE_KEY)
  storage?.removeItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY)
}

function buildHeaders({ token, headers = {}, isFormData = false } = {}) {
  const nextHeaders = { ...headers }
  if (token) {
    nextHeaders.Authorization = `Bearer ${token}`
  }
  if (!isFormData) {
    nextHeaders['Content-Type'] = nextHeaders['Content-Type'] || 'application/json'
  }
  return nextHeaders
}

async function readResponseBody(response) {
  const raw = await response.text()
  let data = {}

  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = { detail: raw || 'Unexpected server response' }
  }

  return data
}

function buildRequestError(response, data) {
  const detail = typeof data.detail === 'object' && data.detail !== null
    ? data.detail
    : {
        code: response.status === 401 ? 'AUTH_ERROR' : 'REQUEST_ERROR',
        message: data.detail || 'Request failed',
      }

  const error = new Error(detail.message || 'Request failed')
  error.code = detail.code || 'REQUEST_ERROR'
  error.status = response.status
  error.data = detail
  return error
}

async function performRequest(path, options = {}) {
  const { token, body, isFormData = false, ...rest } = options
  const headers = buildHeaders({ token, headers: rest.headers, isFormData })
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  })

  const data = await readResponseBody(response)
  return { response, data }
}

export async function refreshSession(refreshToken = getStoredRefreshToken()) {
  if (!refreshToken) {
    throw new Error('No refresh token available.')
  }

  const { response, data } = await performRequest('/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  })

  if (!response.ok) {
    clearSession()
    throw buildRequestError(response, data)
  }

  return persistSession(data)
}

async function request(path, options = {}) {
  const {
    token,
    allowSessionRefresh = true,
    ...rest
  } = options
  const resolvedToken = getStoredAccessToken() || token
  const { response, data } = await performRequest(path, { ...rest, token: resolvedToken })

  if (
    response.status === 401
    && allowSessionRefresh
    && path !== '/login'
    && path !== '/signup'
    && path !== '/refresh'
  ) {
    const refreshToken = getStoredRefreshToken()
    if (refreshToken) {
      try {
        const authResponse = await refreshSession(refreshToken)
        return request(path, {
          ...options,
          token: authResponse.access_token,
          allowSessionRefresh: false,
        })
      } catch {
        clearSession()
      }
    }
  }

  if (!response.ok) {
    throw buildRequestError(response, data)
  }

  return data
}

export function signup(payload) {
  return request('/signup', { method: 'POST', body: payload, allowSessionRefresh: false })
}

export function login(payload) {
  return request('/login', { method: 'POST', body: payload, allowSessionRefresh: false })
}

export function logoutSession() {
  const refreshToken = getStoredRefreshToken()
  clearSession()

  if (!refreshToken) {
    return Promise.resolve()
  }

  return request('/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
    allowSessionRefresh: false,
  }).catch(() => undefined)
}

export function getMe(token) {
  return request('/me', { token })
}

export function getDocuments(token) {
  return request('/documents', { token })
}

export function getChatHistory(token) {
  return request('/chat/history', { token })
}

export function uploadDocument(token, file) {
  const formData = new FormData()
  formData.append('file', file)
  return request('/upload', {
    method: 'POST',
    token,
    body: formData,
    isFormData: true,
  })
}

export function sendChat(token, query) {
  return request('/chat', {
    method: 'POST',
    token,
    body: { query },
  })
}

export function createOrder(token) {
  return request('/create-order', { method: 'POST', token })
}

export async function generateVoiceAudio(text, targetLang, signal, token, hasRetried = false) {
  const timeoutController = new globalThis.AbortController()
  let didTimeout = false
  let unsubscribeExternalAbort = null

  if (signal) {
    if (signal.aborted) {
      timeoutController.abort()
    } else {
      const abortOnExternalSignal = () => timeoutController.abort()
      signal.addEventListener('abort', abortOnExternalSignal, { once: true })
      unsubscribeExternalAbort = () => {
        signal.removeEventListener('abort', abortOnExternalSignal)
      }
    }
  }

  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true
    timeoutController.abort()
  }, VOICE_REQUEST_TIMEOUT_MS)

  let response
  try {
    response = await fetch(`${API_BASE}/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        ...(getStoredAccessToken() || token
          ? { Authorization: `Bearer ${getStoredAccessToken() || token}` }
          : {}),
      },
      body: JSON.stringify({
        text,
        target_lang: targetLang,
      }),
      signal: timeoutController.signal,
    })
  } catch (error) {
    if (didTimeout) {
      throw new Error('Voice request timed out. Please try again.')
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeoutId)
    unsubscribeExternalAbort?.()
  }

  if (response.status === 401 && !hasRetried && getStoredRefreshToken()) {
    await refreshSession(getStoredRefreshToken())
    return generateVoiceAudio(text, targetLang, signal, token, true)
  }

  if (!response.ok) {
    const data = await readResponseBody(response)
    throw buildRequestError(response, data)
  }

  const blob = await response.blob()
  if (!blob.size) {
    throw new Error('Voice API returned an empty audio file.')
  }

  return {
    blob,
    sourceLanguage: (response.headers.get('X-Source-Language') || '').toLowerCase(),
    outputLanguage: (response.headers.get('X-Output-Language') || '').toLowerCase(),
    cacheStatus: (response.headers.get('X-Voice-Cache') || '').toLowerCase(),
  }
}

export function verifyPayment(token, payload) {
  return request('/verify-payment', { method: 'POST', token, body: payload })
}

export function getAdminOverview(token) {
  return request('/admin/overview', { token })
}

export function markOnboardingSeen(token) {
  return request('/me/onboarding-seen', { method: 'POST', token })
}

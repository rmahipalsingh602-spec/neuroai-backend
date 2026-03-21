const DEFAULT_API_BASE = 'https://neuroai-backend-0gl2.onrender.com'
const API_BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, '')
const VOICE_REQUEST_TIMEOUT_MS = 45000

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

async function request(path, options = {}) {
  const { token, body, isFormData = false, ...rest } = options
  const headers = buildHeaders({ token, headers: rest.headers, isFormData })

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  })

  const data = await readResponseBody(response)

  if (!response.ok) {
    throw buildRequestError(response, data)
  }

  return data
}

export function signup(payload) {
  return request('/signup', { method: 'POST', body: payload })
}

export function login(payload) {
  return request('/login', { method: 'POST', body: payload })
}

export function getMe(token) {
  return request('/me', { token })
}

export function getDocuments(token) {
  return request('/documents', { token })
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

export async function generateVoiceAudio(text, targetLang, signal) {
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

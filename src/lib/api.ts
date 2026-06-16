import type {
  ChatRequestPayload,
  FileChatResponse,
  StreamEvent,
} from '../types/api'

const API_PREFIX = '/api'

export class ApiError extends Error {
  status: number
  payload: unknown
  requestId: string | null

  constructor(message: string, status: number, payload: unknown, requestId: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
    this.requestId = requestId
  }
}

export interface UiSessionResponse {
  ok: boolean
  authenticated: boolean
  expires_at?: string
}

function requestHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers)
}

function isSessionInvalid(response: Response): boolean {
  return response.headers.get('x-hive-auth-state') === 'session-invalid'
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  try {
    return contentType.includes('application/json') ? await response.json() : await response.text()
  } catch {
    return null
  }
}

function responseDetail(response: Response, payload: unknown): string {
  if (typeof payload === 'object' && payload && 'detail' in payload) {
    return String((payload as { detail: unknown }).detail)
  }
  return `Request failed with status ${response.status}`
}

async function sameOriginFetch(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${API_PREFIX}${path}`, {
      ...init,
      headers: requestHeaders(init.headers),
      cache: 'no-store',
      credentials: 'same-origin',
    })
  } catch (caught) {
    const message = navigator.onLine ? 'The HIVE service could not be reached.' : 'The browser is offline.'
    throw new ApiError(message, 0, caught)
  }
}

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await sameOriginFetch(path, init)
  const payload = await parseResponsePayload(response)
  if (!response.ok) {
    throw new ApiError(
      responseDetail(response, payload),
      response.status,
      payload,
      response.headers.get('x-request-id'),
    )
  }
  return payload as T
}

export function loginUi(accessKey: string): Promise<UiSessionResponse> {
  return authFetch<UiSessionResponse>('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_key: accessKey }),
  })
}

export function getUiSession(): Promise<UiSessionResponse> {
  return authFetch<UiSessionResponse>('/auth/session')
}

export function logoutUi(): Promise<UiSessionResponse> {
  return authFetch<UiSessionResponse>('/auth/logout', { method: 'POST' })
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = requestHeaders(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await sameOriginFetch(path, { ...init, headers })
  const payload = await parseResponsePayload(response)

  if (!response.ok) {
    if (isSessionInvalid(response)) {
      window.dispatchEvent(new CustomEvent('hive:unauthorised'))
    }
    throw new ApiError(
      responseDetail(response, payload),
      response.status,
      payload,
      response.headers.get('x-request-id'),
    )
  }
  return payload as T
}

interface StreamHandlers {
  onEvent: (event: StreamEvent) => void
}

function parseFrame(frame: string): StreamEvent | null {
  let eventName = 'message'
  const dataLines: string[] = []

  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim()
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  if (!dataLines.length) return null

  const raw = dataLines.join('\n')
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return { event: eventName, ...parsed }
  } catch {
    return { event: eventName, message: raw }
  }
}

export async function streamChat(
  payload: ChatRequestPayload,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${API_PREFIX}/v1/chat/stream`, {
      method: 'POST',
      headers: requestHeaders({ 'content-type': 'application/json', accept: 'text/event-stream' }),
      body: JSON.stringify(payload),
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
    })
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'AbortError') throw caught
    const message = navigator.onLine ? 'The HIVE chat stream could not be reached.' : 'The browser is offline.'
    throw new ApiError(message, 0, caught)
  }

  if (!response.ok || !response.body) {
    let detail = `Chat stream failed with status ${response.status}`
    let payload: unknown = null
    try {
      payload = await response.json()
      if (typeof payload === 'object' && payload && 'detail' in payload) {
        detail = String((payload as { detail: unknown }).detail)
      }
    } catch {
      // Keep the status-based message.
    }
    if (isSessionInvalid(response)) {
      window.dispatchEvent(new CustomEvent('hive:unauthorised'))
    }
    throw new ApiError(detail, response.status, payload, response.headers.get('x-request-id'))
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const event = parseFrame(frame)
      if (event) handlers.onEvent(event)
    }
    if (done) break
  }

  if (buffer.trim()) {
    const event = parseFrame(buffer)
    if (event) handlers.onEvent(event)
  }
}

export function chatWithFile(
  lane: string,
  objectKey: string,
  payload: ChatRequestPayload & { workflow_preset?: string | null },
  signal?: AbortSignal,
): Promise<FileChatResponse> {
  const uploadsLane = lane === 'uploads'
  return apiFetch<FileChatResponse>('/v1/chat/with-file', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      lane,
      object_key: objectKey,
      message: payload.message,
      mode: payload.mode === 'auto' ? 'file_analysis' : payload.mode,
      model: payload.model,
      conversation_id: payload.conversation_id,
      history: payload.history ?? [],
      workflow_preset: payload.workflow_preset ?? null,
      use_chunks: uploadsLane,
      use_vectorize: uploadsLane,
      vectorize_fallback_sql: true,
      auto_chunk: uploadsLane,
    }),
  })
}

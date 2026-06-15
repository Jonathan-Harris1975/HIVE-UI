import { authStore } from '@/store/auth'
import type { ApiError } from '@/types'

const BASE_URL = import.meta.env.VITE_HIVE_API_URL ?? ''

export class HiveApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'HiveApiError'
    this.status = status
    this.detail = detail
  }
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  }
  const token = authStore.getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    authStore.setValid(false)
    throw new HiveApiError(401, 'Unauthorised — check your bearer token')
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as ApiError
      detail = body.detail ?? body.message ?? detail
    } catch {
      // ignore parse error
    }
    throw new HiveApiError(res.status, detail)
  }
  authStore.setValid(true)
  return res.json() as Promise<T>
}

// ── Core request methods ──────────────────────────────────────────────────

export async function apiGet<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: buildHeaders(),
  })
  return handleResponse<T>(res)
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(res)
}

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {}
  const token = authStore.getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  // do NOT set Content-Type — browser sets it with boundary for multipart
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  })
  return handleResponse<T>(res)
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  })
  return handleResponse<T>(res)
}

// ── SSE streaming helper ──────────────────────────────────────────────────
// Returns an async generator that yields raw SSE data lines.
// The caller is responsible for JSON-parsing and reassembly.

export async function* streamPost(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const token = authStore.getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (res.status === 401) {
    authStore.setValid(false)
    throw new HiveApiError(401, 'Unauthorised — check your bearer token')
  }
  if (!res.ok) {
    throw new HiveApiError(res.status, `Stream error: HTTP ${res.status}`)
  }
  authStore.setValid(true)

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data && data !== '[DONE]') yield data
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

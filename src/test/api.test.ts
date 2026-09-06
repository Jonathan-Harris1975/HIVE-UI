import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiFetch,
  chatWithFile,
  chatWithFiles,
  getUiSession,
  loginUi,
  logoutUi,
  recordUiActivity,
} from '../lib/api'
import type { ChatRequestPayload } from '../types/api'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const basePayload: ChatRequestPayload = {
  message: 'Inspect this file',
  mode: 'auto',
  model: 'default',
  conversation_id: 'conversation-1',
  history: [{ role: 'user', content: 'Earlier context' }],
}

describe('API helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses same-origin session endpoints with the expected methods and login body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, authenticated: true }))
    vi.stubGlobal('fetch', fetchMock)

    await loginUi('access-key')
    await getUiSession()
    await recordUiActivity()
    await logoutUi()

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth/login',
      '/api/auth/session',
      '/api/auth/activity',
      '/api/auth/logout',
    ])

    const loginInit = fetchMock.mock.calls[0][1] as RequestInit
    expect(loginInit.method).toBe('POST')
    expect(JSON.parse(loginInit.body as string)).toEqual({ access_key: 'access-key' })
    expect((loginInit.headers as Headers).get('content-type')).toBe('application/json')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ cache: 'no-store', credentials: 'same-origin' })
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'POST' })
    expect(fetchMock.mock.calls[3][1]).toMatchObject({ method: 'POST' })
  })

  it('dispatches hive:unauthorised and preserves server detail and request id for invalid sessions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { detail: { reason: 'Session expired' } },
          401,
          { 'x-hive-auth-state': 'session-invalid', 'x-request-id': 'request-123' },
        ),
      ),
    )
    const unauthorisedHandler = vi.fn()
    window.addEventListener('hive:unauthorised', unauthorisedHandler)

    await expect(apiFetch('/v1/private')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Session expired',
      requestId: 'request-123',
    })
    expect(unauthorisedHandler).toHaveBeenCalledTimes(1)

    window.removeEventListener('hive:unauthorised', unauthorisedHandler)
  })

  it('falls back to status detail when a JSON error payload cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{not-json', {
          status: 502,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(apiFetch('/v1/broken')).rejects.toMatchObject({
      status: 502,
      message: 'Request failed with status 502',
      payload: null,
    })
  })

  it('returns text payloads unchanged and does not invent a JSON content type without a body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('healthy', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch<string>('/health')).resolves.toBe('healthy')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Headers).has('content-type')).toBe(false)
  })

  it('normalises a single uploads file for file analysis and enables chunk retrieval', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, reply: 'done' }))
    vi.stubGlobal('fetch', fetchMock)

    await chatWithFiles(
      [
        { lane: '', object_key: 'ignored' },
        { lane: 'uploads', object_key: 'uploads/report.pdf', name: null },
      ],
      basePayload,
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/chat/with-file')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      files: [{ lane: 'uploads', object_key: 'uploads/report.pdf' }],
      message: 'Inspect this file',
      mode: 'file_analysis',
      model: 'default',
      conversation_id: 'conversation-1',
      history: [{ role: 'user', content: 'Earlier context' }],
      workflow_preset: null,
      skill_id: null,
      skill_title: null,
      use_chunks: true,
      use_vectorize: true,
      vectorize_fallback_sql: true,
      auto_chunk: true,
    })
  })

  it('keeps explicit file-chat options and delegates chatWithFile through the same contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await chatWithFiles(
      [
        { lane: 'documents', object_key: 'docs/a.txt', name: 'a.txt' },
        { lane: 'documents', object_key: 'docs/b.txt', name: 'b.txt' },
      ],
      {
        ...basePayload,
        mode: 'audit',
        workflow_preset: 'repository-review',
        skill_id: 'skill-7',
        skill_title: 'Repository Reviewer',
      },
    )
    await chatWithFile('documents', 'docs/single.txt', { ...basePayload, history: undefined })

    const multiBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(multiBody).toMatchObject({
      mode: 'audit',
      workflow_preset: 'repository-review',
      skill_id: 'skill-7',
      skill_title: 'Repository Reviewer',
      use_chunks: false,
      use_vectorize: false,
      auto_chunk: false,
    })
    expect(multiBody.files).toEqual([
      { lane: 'documents', object_key: 'docs/a.txt', name: 'a.txt' },
      { lane: 'documents', object_key: 'docs/b.txt', name: 'b.txt' },
    ])

    const singleBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(singleBody.files).toEqual([{ lane: 'documents', object_key: 'docs/single.txt' }])
    expect(singleBody.history).toEqual([])
  })

  it('wraps same-origin network failures in ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(apiFetch('/v1/unreachable')).rejects.toBeInstanceOf(ApiError)
    await expect(apiFetch('/v1/unreachable')).rejects.toMatchObject({ status: 0 })
  })
})

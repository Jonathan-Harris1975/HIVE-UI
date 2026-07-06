import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, streamChat } from '../lib/api'
import type { ChatRequestPayload, StreamEvent } from '../types/api'

function sseBodyStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < frames.length) {
        controller.enqueue(encoder.encode(frames[index]))
        index += 1
      } else {
        controller.close()
      }
    },
  })
}

function streamResponse(frames: string[], init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(sseBodyStream(frames), {
    status: init.status ?? 200,
    headers: { 'content-type': 'text/event-stream', ...init.headers },
  })
}

const basePayload: ChatRequestPayload = {
  message: 'hello',
  mode: 'auto',
  model: 'default',
  conversation_id: null,
  history: [],
}

describe('streamChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses multiple SSE frames into individual events, in order', async () => {
    const frames = [
      'event: token\ndata: {"message":"Hel"}\n\n',
      'event: token\ndata: {"message":"lo"}\n\n',
      'event: done\ndata: {"message":""}\n\n',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(frames)))

    const events: StreamEvent[] = []
    await streamChat(basePayload, { onEvent: (event) => events.push(event) })

    expect(events.map((e) => e.event)).toEqual(['token', 'token', 'done'])
    expect(events[0]).toMatchObject({ message: 'Hel' })
    expect(events[1]).toMatchObject({ message: 'lo' })
  })

  it('handles a frame split across multiple stream chunks', async () => {
    const frames = ['event: token\ndata: {"mess', 'age":"buffered"}\n\n']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(frames)))

    const events: StreamEvent[] = []
    await streamChat(basePayload, { onEvent: (event) => events.push(event) })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ event: 'token', message: 'buffered' })
  })

  it('flushes a trailing frame with no terminating blank line', async () => {
    const frames = ['event: done\ndata: {"message":"final"}']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(frames)))

    const events: StreamEvent[] = []
    await streamChat(basePayload, { onEvent: (event) => events.push(event) })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ event: 'done', message: 'final' })
  })

  it('rejects with an ApiError carrying the server detail when the stream request fails', async () => {
    const errorResponse = new Response(JSON.stringify({ detail: 'Model unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse))

    await expect(streamChat(basePayload, { onEvent: () => {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: 'Model unavailable',
    })
  })

  it('dispatches hive:unauthorised and rejects when the session is invalid mid-stream', async () => {
    const errorResponse = new Response(JSON.stringify({ detail: 'Session expired' }), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'x-hive-auth-state': 'session-invalid',
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse))

    const unauthorisedHandler = vi.fn()
    window.addEventListener('hive:unauthorised', unauthorisedHandler)

    await expect(streamChat(basePayload, { onEvent: () => {} })).rejects.toBeInstanceOf(ApiError)
    expect(unauthorisedHandler).toHaveBeenCalledTimes(1)

    window.removeEventListener('hive:unauthorised', unauthorisedHandler)
  })

  it('propagates network failure as an ApiError with status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(streamChat(basePayload, { onEvent: () => {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
    })
  })

  it('re-throws AbortError as-is instead of wrapping it in ApiError', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))
    const controller = new AbortController()

    await expect(streamChat(basePayload, { onEvent: () => {} }, controller.signal)).rejects.toBe(
      abortError,
    )
  })
})

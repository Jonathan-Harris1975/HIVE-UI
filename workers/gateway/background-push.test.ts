import { describe, expect, it, vi } from 'vitest'
import gateway from './index'
import { createSessionToken, sessionCookie } from './security'
import { allowedPushEndpoint, generatePushKeys, vapidAuthorization, readAlertSource } from './background-push'

describe('background push', () => {
  it('allows only supported HTTPS push provider endpoints', () => {
    expect(allowedPushEndpoint('https://fcm.googleapis.com/fcm/send/example')).not.toBeNull()
    expect(allowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/example')).not.toBeNull()
    for (const endpoint of [
      'http://fcm.googleapis.com/send/example', 'https://fcm.googleapis.com.evil.test/send/example',
      'https://127.0.0.1/private', 'https://fcm.googleapis.com:444/send/example',
      'https://user:pass@fcm.googleapis.com/send/example', 'https://fcm.googleapis.com/send/example#secret',
    ]) expect(allowedPushEndpoint(endpoint)).toBeNull()
  })

  it('generates a verifiable ES256 VAPID token bound to the provider origin', async () => {
    const keys = await generatePushKeys()
    const endpoint = 'https://fcm.googleapis.com/fcm/send/example'
    const now = 1700000000000
    const header = await vapidAuthorization(keys, endpoint, now)
    const [token, key] = header.slice(8).split(', k=')
    expect(key).toBe(keys.publicKey)
    const [head, claims, signature] = token.split('.')
    const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0))
    expect(JSON.parse(new TextDecoder().decode(decode(claims)))).toMatchObject({
      aud: 'https://fcm.googleapis.com', exp: now / 1000 + 3600,
    })
    const publicKey = await crypto.subtle.importKey('raw', decode(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, decode(signature), new TextEncoder().encode(head + '.' + claims))).toBe(true)
  })

  it('limits communications queries to the authenticated handoff actor and selects only IDs and timestamps', async () => {
    let sql = ''
    let params: unknown[] = []
    const db = { prepare(query: string) {
      sql = query
      return { bind(...values: unknown[]) {
        params = values
        return { all: async () => ({ success: true, results: [{ id: 'alert-1', created_at: '2026-11-28T00:00:00Z' }] }) }
      } }
    } } as unknown as Parameters<typeof readAlertSource>[0]['PUSH_AIMS_DB']
    const cutoff = Date.parse('2026-11-28T01:00:00Z')
    const result = await readAlertSource({ PUSH_AIMS_DB: db, HIVE_COMMS_ACTOR: 'owner-test' }, 'communications', cutoff - 3600000, cutoff)
    expect(sql).toContain('SELECT id, created_at')
    expect(sql).toContain("actor = ? AND status = 'unread'")
    expect(params[0]).toBe('owner-test')
    expect(result.ids).toEqual(['communications:alert-1'])
  })
})

describe('background push gateway boundary', () => {
  const secret = 'test-only-session-signing-secret'
  const url = 'https://hive.example/api/v1/system/background-push/register'
  it('rejects an unauthenticated or cross-origin device enrollment', async () => {
    const stub = vi.fn()
    const env = {
      HIVE_UI_SESSION_SECRET: secret,
      NOTIFICATION_PUSH_HUB: { get: stub, idFromName: vi.fn() },
    } as unknown as Parameters<typeof gateway.fetch>[1]
    const body = JSON.stringify({ endpoint: 'https://fcm.googleapis.com/send/example' })
    const unauth = await gateway.fetch(new Request(url, {
      method: 'POST', headers: { origin: 'https://hive.example' }, body,
    }), env)
    expect(unauth.status).toBe(401)
    const { token } = await createSessionToken(secret, 3600, 1800, true, true)
    const cross = await gateway.fetch(new Request(url, {
      method: 'POST', headers: { origin: 'https://other.example', cookie: sessionCookie(token, 3600) }, body,
    }), env)
    expect(cross.status).toBe(403)
    expect(stub).not.toHaveBeenCalled()
  })

  it('forwards only the allowlisted device operation without credentials or backend access', async () => {
    const { token } = await createSessionToken(secret, 3600, 1800, true, true)
    const dispatch = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      expect(headers.has('cookie')).toBe(false)
      expect(headers.has('authorization')).toBe(false)
      return Response.json({ ok: true, registered: true })
    })
    const env = {
      HIVE_UI_SESSION_SECRET: secret,
      NOTIFICATION_PUSH_HUB: { get: () => ({ fetch: dispatch }), idFromName: () => 'test' },
    } as unknown as Parameters<typeof gateway.fetch>[1]
    const response = await gateway.fetch(new Request(url, {
      method: 'POST',
      headers: { origin: 'https://hive.example', cookie: sessionCookie(token, 3600), 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/send/example' }),
    }), env)
    expect(response.status).toBe(200)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})


describe('owner system notification routing', () => {
  it('only includes the reserved admin system inbox for the configured HIVE admin owner', async () => {
    let sql = ''
    let params: unknown[] = []
    const db = { prepare(query: string) {
      sql = query
      return { bind(...values: unknown[]) {
        params = values
        return { all: async () => ({ success: true, results: [] }) }
      } }
    } } as unknown as Parameters<typeof readAlertSource>[0]['PUSH_AIMS_DB']
    const cutoff = Date.parse('2026-11-28T01:00:00Z')
    for (const [actor, role, expected] of [
      ['hive-owner', 'admin', true], ['hive-owner', 'read_only', false], ['other', 'admin', false],
    ] as const) {
      await readAlertSource({
        PUSH_AIMS_DB: db, HIVE_COMMS_ACTOR: actor, HIVE_COMMS_ROLE: role,
      }, 'communications', cutoff - 3600000, cutoff)
      expect(params[0]).toBe(actor)
      expect(sql.includes("actor = 'admin' AND type IN")).toBe(expected)
      expect(sql).not.toContain("'assignment'")
      expect(sql).not.toContain("'mention'")
      expect(sql).toContain("status = 'unread'")
    }
  })
})

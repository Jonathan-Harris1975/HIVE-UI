import { describe, expect, it } from 'vitest'
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

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearSessionCookie,
  createSessionToken,
  parseSessionTtl,
  secureStringEqual,
  sessionCookie,
  verifySessionToken,
} from '../.security-test/security.js'

test('access-key comparison accepts exact values and rejects different values', async () => {
  assert.equal(await secureStringEqual('correct horse battery staple', 'correct horse battery staple'), true)
  assert.equal(await secureStringEqual('correct horse battery staple', 'correct horse battery stapler'), false)
  assert.equal(await secureStringEqual('', 'x'), false)
})

test('signed sessions verify, expire and reject tampering', async () => {
  const secret = 'test-only-secret-with-enough-entropy'
  const { token, payload } = await createSessionToken(secret, 3600, 1_700_000_000)

  const verified = await verifySessionToken(token, secret, 1_700_000_100)
  assert.equal(verified?.sid, payload.sid)
  assert.equal(await verifySessionToken(token, secret, 1_700_003_601), null)
  assert.equal(await verifySessionToken(`${token.slice(0, -1)}x`, secret, 1_700_000_100), null)
  assert.equal(await verifySessionToken(token, `${secret}-wrong`, 1_700_000_100), null)
})

test('session TTL is clamped to the supported production range', () => {
  assert.equal(parseSessionTtl(undefined), 43_200)
  assert.equal(parseSessionTtl('10'), 900)
  assert.equal(parseSessionTtl('999999'), 86_400)
  assert.equal(parseSessionTtl('not-a-number'), 43_200)
})

test('session cookies use hardened host-only attributes', () => {
  const cookie = sessionCookie('signed-token', 3600)
  for (const required of ['__Host-hive_session=', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=3600']) {
    assert.match(cookie, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(clearSessionCookie(), /Max-Age=0/)
})

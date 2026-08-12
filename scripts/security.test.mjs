import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearSessionCookie,
  createCommsHandoffToken,
  createSessionToken,
  parseIdleTimeout,
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
  const { token, payload } = await createSessionToken(secret, 3600, 1800, true, 1_700_000_000)

  const verified = await verifySessionToken(token, secret, 1_700_000_100)
  assert.equal(verified?.sid, payload.sid)
  assert.equal(verified?.hive_owner, true)
  assert.equal(await verifySessionToken(token, secret, 1_700_001_801), null)
  assert.equal((await verifySessionToken(token, secret, 1_700_001_801, true))?.sid, payload.sid)
  assert.equal(await verifySessionToken(token, secret, 1_700_003_601, true), null)
  assert.equal(await verifySessionToken(`${token.slice(0, -1)}x`, secret, 1_700_000_100), null)
  assert.equal(await verifySessionToken(token, `${secret}-wrong`, 1_700_000_100), null)
})

test('idle timeout is clamped independently from the absolute session TTL', () => {
  assert.equal(parseIdleTimeout(undefined), 1_800)
  assert.equal(parseIdleTimeout('10'), 300)
  assert.equal(parseIdleTimeout('999999'), 7_200)
  assert.equal(parseIdleTimeout('not-a-number'), 1_800)
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


test('communications handoff token is short-lived and contains no HIVE access key', async () => {
  const secret = 'shared-comms-handoff-secret'
  const token = await createCommsHandoffToken(secret, 'hive-owner', 'admin', 300, 1_700_000_000)
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.equal(token.includes('shared-comms-handoff-secret'), false)
  const payload = JSON.parse(Buffer.from(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  assert.equal(payload.aud, 'aims-comms')
  assert.equal(payload.actor, 'hive-owner')
  assert.equal(payload.role, 'admin')
  assert.equal(payload.exp - payload.iat, 300)
})

import { afterEach, expect, test, vi } from 'vitest'
import gateway from './index'
import { createSessionToken, sessionCookie } from './security'
import { isPrivilegedBrowserPath } from './proxy-policy'

const TEXTBEE_SECRET = 'test-only-textbee-webhook-signing-secret'

test('persisted report links enter the authenticated API instead of the SPA', async () => {
  const env = {
    HIVE_UI_SESSION_SECRET: 'test-only-session-signing-secret',
    HIVE_ADMIN_TOKEN: 'test-only-admin-token',
    HIVE_API_BASE_URL: 'https://backend.example',
  } as Parameters<typeof gateway.fetch>[1]
  for (const document of ['html', 'repository-html']) {
    const response = await gateway.fetch(new Request(
      `https://hive.example/v1/system/lifecycle-reports/${document}?year=2026&week=44&repository=HIVE`,
    ), env)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      `https://hive.example/api/v1/system/lifecycle-reports/${document}?year=2026&week=44&repository=HIVE`,
    )
    const protectedResponse = await gateway.fetch(new Request(response.headers.get('location')!), env)
    expect(protectedResponse.status).toBe(401)
  }
})

async function textBeeSignature(body: string, secret = TEXTBEE_SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const textBeePayload = JSON.stringify({
  smsId: 'sms-test-1',
  message: 'Your Amazon security code is 123456',
  sender: 'Amazon',
  deviceId: 'device-test-1',
  webhookSubscriptionId: 'subscription-test-1',
  webhookEvent: 'MESSAGE_RECEIVED',
  idempotencyKey: 'delivery-test-1',
  receivedAt: '2026-10-25T12:00:00.000Z',
})

test('TextBee KDP OTP webhook verifies the raw signature and forwards to AIMS', async () => {
  const signature = await textBeeSignature(textBeePayload)
  const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ok: true, accepted: true }, { status: 202 }))
  const response = await gateway.fetch(new Request('https://hive.example/webhooks/textbee/kdp-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': signature },
    body: textBeePayload,
  }), {
    AIMS_API_BASE_URL: 'https://aims.example',
    AIMS_ADMIN_TOKEN: 'test-only-aims-token',
    TEXTBEE_WEBHOOK_SECRET: TEXTBEE_SECRET,
  } as Parameters<typeof gateway.fetch>[1])

  expect(response.status).toBe(202)
  expect(await response.json()).toMatchObject({ ok: true, accepted: true })
  expect(upstream).toHaveBeenCalledTimes(1)
  const [url, init] = upstream.mock.calls[0] as [URL | string, RequestInit]
  expect(String(url)).toBe('https://aims.example/kdp/otp/textbee')
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-only-aims-token')
  expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(textBeePayload)
})

test('TextBee KDP OTP webhook rejects a bad signature without forwarding SMS content', async () => {
  const upstream = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Must not reach AIMS'))
  const response = await gateway.fetch(new Request('https://hive.example/webhooks/textbee/kdp-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': '0'.repeat(64) },
    body: textBeePayload,
  }), {
    AIMS_API_BASE_URL: 'https://aims.example',
    AIMS_ADMIN_TOKEN: 'test-only-aims-token',
    TEXTBEE_WEBHOOK_SECRET: TEXTBEE_SECRET,
  } as Parameters<typeof gateway.fetch>[1])

  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ code: 'invalid_webhook_signature' })
  expect(upstream).not.toHaveBeenCalled()
})

test('TextBee webhook returns a retryable response if AIMS is unavailable', async () => {
  const signature = await textBeeSignature(textBeePayload)
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('AIMS unavailable'))
  const response = await gateway.fetch(new Request('https://hive.example/webhooks/textbee/kdp-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': signature },
    body: textBeePayload,
  }), {
    AIMS_API_BASE_URL: 'https://aims.example',
    AIMS_ADMIN_TOKEN: 'test-only-aims-token',
    TEXTBEE_WEBHOOK_SECRET: TEXTBEE_SECRET,
  } as Parameters<typeof gateway.fetch>[1])

  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ code: 'aims_kdp_forward_unavailable' })
})

afterEach(() => vi.restoreAllMocks())

for (const path of [
  'v1/execution-reviews/plan-123/decision',
  'v1/execution-reviews/plan-123/%64ecision',
  'v1/services/AIMS/proxy', 'v1/services/RAMS/%70roxy',
  'v1/repairs/run', 'v1/deployments/production',
  'v1/execute', 'v1/approvals', 'v1/%2564eploy', 'v1/%ZZ',
]) {
  test(`signed browser session cannot forward ${path}`, async () => {
    const secret = 'test-only-session-signing-secret'
    const { token } = await createSessionToken(secret, 3600, 1800, true, true)
    const upstream = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Must not reach upstream'))
    const request = new Request(`https://hive.example/api/${path}`, {
      method: 'POST',
      headers: { origin: 'https://hive.example', cookie: sessionCookie(token, 3600), 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved', reviewer: 'forged-operator' }),
    })
    const env = {
      HIVE_UI_SESSION_SECRET: secret,
      HIVE_ADMIN_TOKEN: 'test-only-admin-token',
      HIVE_API_BASE_URL: 'https://backend.example',
    } as Parameters<typeof gateway.fetch>[1]
    const response = await gateway.fetch(request, env)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'privileged_operation_denied' })
    expect(upstream).not.toHaveBeenCalled()
  })
}

for (const [path, method] of [
  ['v1/system/lifecycle-reviews/review-123/accept-fix', 'POST'],
  ['v1/db/purge-reset', 'POST'],
  ['v1/system/ops-events?clear_all=true', 'DELETE'],
  ['v1/files/r2/uploads/objects', 'DELETE'],
  ['v1/db/conversations/conversation-123', 'DELETE'],
  ['v1/model-registry/coding', 'POST'],
  ['v1/model-registry/coding/model-123', 'DELETE'],
] as const) {
  test(`signed browser session cannot submit ${method} ${path}`, async () => {
    const secret = 'test-only-session-signing-secret'
    const { token } = await createSessionToken(secret, 3600, 1800, true, true)
    const upstream = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Must not reach upstream'))
    const request = new Request(`https://hive.example/api/${path}`, {
      method,
      headers: { origin: 'https://hive.example', cookie: sessionCookie(token, 3600), 'content-type': 'application/json' },
      body: method === 'DELETE' ? undefined : JSON.stringify({ confirmation: 'test-only' }),
    })
    const env = {
      HIVE_UI_SESSION_SECRET: secret,
      HIVE_ADMIN_TOKEN: 'test-only-admin-token',
      HIVE_API_BASE_URL: 'https://backend.example',
    } as Parameters<typeof gateway.fetch>[1]
    const response = await gateway.fetch(request, env)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'privileged_operation_denied' })
    expect(upstream).not.toHaveBeenCalled()
  })
}

test('unauthenticated callers cannot submit privileged decisions', async () => {
  const upstream = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Must not reach upstream'))
  const response = await gateway.fetch(new Request(
    'https://hive.example/api/v1/system/lifecycle-reviews/review-123/accept-fix',
    { method: 'POST', headers: { origin: 'https://hive.example' }, body: '{}' },
  ), {} as Parameters<typeof gateway.fetch>[1])
  expect(response.status).toBe(403)
  expect(upstream).not.toHaveBeenCalled()
})

test('HIVE outage returns an explicit unknown-state error instead of a cached success', async () => {
  const secret = 'test-only-session-signing-secret'
  const { token } = await createSessionToken(secret, 3600, 1800, true, true)
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('upstream unavailable'))
  const response = await gateway.fetch(new Request('https://hive.example/api/health', {
    headers: { origin: 'https://hive.example', cookie: sessionCookie(token, 3600) },
  }), {
    HIVE_UI_SESSION_SECRET: secret,
    HIVE_ADMIN_TOKEN: 'test-only-admin-token',
    HIVE_API_BASE_URL: 'https://backend.example',
  } as Parameters<typeof gateway.fetch>[1])
  expect(response.status).toBe(502)
  expect(await response.json()).toMatchObject({ code: 'backend_unreachable' })
  expect(response.headers.get('cache-control')).toContain('no-store')
})

test('upstream HTTP 403 remains an explicit rejection with its request correlation', async () => {
  const secret = 'test-only-session-signing-secret'
  const { token } = await createSessionToken(secret, 3600, 1800, true, true)
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    ok: false,
    code: 'repair_provider_forbidden',
    detail: 'The configured repair provider rejected the handoff.',
  }), { status: 403, headers: { 'content-type': 'application/json' } }))
  const response = await gateway.fetch(new Request('https://hive.example/api/v1/system/lifecycle-reviews', {
    headers: {
      origin: 'https://hive.example',
      cookie: sessionCookie(token, 3600),
      'x-request-id': 'hive-ui-repair-403',
    },
  }), {
    HIVE_UI_SESSION_SECRET: secret,
    HIVE_ADMIN_TOKEN: 'test-only-admin-token',
    HIVE_API_BASE_URL: 'https://backend.example',
  } as Parameters<typeof gateway.fetch>[1])
  expect(response.status).toBe(403)
  expect(response.headers.get('x-request-id')).toBe('hive-ui-repair-403')
  expect(await response.json()).toMatchObject({ code: 'repair_provider_forbidden' })
})

test('privilege policy preserves ordinary UI and evidence routes', () => {
  for (const path of [
    'health', 'v1/models', 'v1/chat/stream', 'v1/files/upload',
    'v1/execution-reviews', 'v1/execution-reviews/plan-123',
    'v1/execution-reviews/plan-123/audit-trail', 'v1/execution-preview',
    'v1/services/AIMS/ensure-ready', 'v1/system/lifecycle-reviews',
    'v1/db/purge-reset/targets', 'v1/db/purge-reset/preview',
    'v1/model-registry/coding', 'v1/files/r2/uploads/objects',
  ]) expect(isPrivilegedBrowserPath(path, 'GET'), path).toBe(false)
  expect(isPrivilegedBrowserPath('v1/db/purge-reset/preview', 'POST')).toBe(false)
  expect(isPrivilegedBrowserPath('v1/system/ops-events', 'GET')).toBe(false)
  expect(isPrivilegedBrowserPath('v1/system/ops-events', 'DELETE')).toBe(true)
})


test('health exposes the complete source SHA and retains the legacy short commit', async () => {
  const { HIVE_UI_BUILD_SHA } = await import('./build-meta')
  const configuredSha = '0123456789abcdef0123456789abcdef01234567'
  const expectedSha = HIVE_UI_BUILD_SHA === 'development' ? configuredSha : HIVE_UI_BUILD_SHA
  const env = { HIVE_UI_BUILD_SHA: configuredSha } as Parameters<typeof gateway.fetch>[1]
  const response = await gateway.fetch(new Request('https://hive.example/health'), env)
  expect(response.status).toBe(200)
  const health = await response.json() as { source_sha: string; commit: string }
  expect(health.source_sha).toBe(expectedSha)
  expect(health.source_sha).toHaveLength(40)
  expect(health.commit).toBe(expectedSha.slice(0, 12))
  expect(response.headers.get('cache-control')).toContain('no-store')
})

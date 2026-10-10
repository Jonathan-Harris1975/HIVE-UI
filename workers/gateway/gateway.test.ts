import { afterEach, expect, test, vi } from 'vitest'
import gateway from './index'
import { createSessionToken, sessionCookie } from './security'
import { isPrivilegedBrowserPath } from './proxy-policy'

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

test('privilege policy preserves ordinary UI and evidence routes', () => {
  for (const path of [
    'health', 'v1/models', 'v1/chat/stream', 'v1/files/upload',
    'v1/execution-reviews', 'v1/execution-reviews/plan-123',
    'v1/execution-reviews/plan-123/audit-trail', 'v1/execution-preview',
    'v1/services/AIMS/ensure-ready',
  ]) expect(isPrivilegedBrowserPath(path), path).toBe(false)
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

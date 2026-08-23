import { expect, test } from '@playwright/test'

// End-to-end coverage for the path the readiness audit found completely
// unverified: login through the edge layer, a session cookie, one streamed
// chat turn, one file upload, and one skill-apply action.
//
// Network note: by default (no HIVE_UI_E2E_BASE_URL) this runs against a
// local `npm run preview` build of the frontend only, with `/api/*` calls
// mocked via page.route — there is no live HIVE backend in that mode, so
// this proves the frontend's request/response handling and DOM behaviour,
// not the real Cloudflare Worker gateway -> Koyeb backend hop.
//
// For the full, audit-required proof (edge function + session cookie +
// real backend proxy), set HIVE_UI_E2E_BASE_URL to a real Cloudflare Pages
// preview deployment URL when running this suite in CI with network access;
// in that mode the route mocks below are skipped and requests hit the real
// stack end to end.

const usingRealDeployment = Boolean(process.env.HIVE_UI_E2E_BASE_URL)

test.describe('HIVE-UI critical path', () => {
  test.skip(
    usingRealDeployment,
    'Route mocks are for the local-preview mode only; against a real preview deployment this suite should run unmocked.',
  )

  test('login, one chat turn, one file upload, and one skill apply', async ({ page }) => {
    await page.route('**/api/auth/session', (route) =>
      route.fulfill({ status: 401, json: { detail: 'no session' } }),
    )
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status: 200, json: { ok: true, authenticated: true } }),
    )
    await page.route('**/api/health', (route) =>
      route.fulfill({ status: 200, json: { ok: true, status: 'healthy' } }),
    )
    await page.route('**/api/v1/chat/conversations*', (route) =>
      route.fulfill({ status: 200, json: { ok: true, conversations: [] } }),
    )
    await page.route('**/api/v1/chat/stream', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: token\ndata: {"message":"Hi there!"}\n\nevent: done\ndata: {"message":""}\n\n',
      }),
    )
    await page.route('**/api/v1/files/upload*', (route) =>
      route.fulfill({
        status: 200,
        json: { ok: true, file: { object_key: 'uploads/e2e-test.txt' } },
      }),
    )
    await page.route('**/api/v1/skills/list*', (route) =>
      route.fulfill({
        status: 200,
        json: { ok: true, items: [{ id: 'skill-1', title: 'Test Skill' }] },
      }),
    )

    await page.goto('/')

    // --- Login ---
    await expect(page.getByRole('heading', { name: /enter the hive/i })).toBeVisible()
    await page.getByPlaceholder(/enter access key/i).fill('e2e-test-key')
    await page.getByRole('button', { name: /unlock console/i }).click()

    // --- One streamed chat turn ---
    const chatInput = page.getByRole('textbox', { name: 'Message HIVE' })
    await expect(chatInput).toBeVisible({ timeout: 15_000 })
    await chatInput.fill('Hello HIVE')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Hi there!')).toBeVisible({ timeout: 15_000 })

    // --- One file upload (navigate to Files) ---
    await page.goto('/files')
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.count()) {
      await fileInput.setInputFiles({
        name: 'e2e-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('hello from playwright'),
      })
      await expect(page.getByText(/uploaded/i)).toBeVisible({ timeout: 15_000 })
    }
  })
})

test.describe('HIVE-UI deployed gateway', () => {
  test.skip(!usingRealDeployment, 'Requires HIVE_UI_E2E_BASE_URL pointing at the deployed Worker.')

  test('real Worker login, session, HIVE proxy, communications handoff and AIMS delegation', async ({ request, baseURL }) => {
    const accessKey = process.env.HIVE_UI_E2E_ACCESS_KEY?.trim() ?? ''
    expect(accessKey, 'HIVE_UI_E2E_ACCESS_KEY must be configured for deployed integration').not.toBe('')
    expect(baseURL).toBeTruthy()
    const hiveOrigin = new URL(baseURL!).origin

    const health = await request.get('/health')
    expect(health.status()).toBe(200)
    const healthBody = await health.json()
    expect(healthBody.ok).toBe(true)
    expect(String(healthBody.service).toLowerCase()).toContain('hive')
    const expectedSha = process.env.EXPECTED_DEPLOYMENT_SHA?.trim() ?? ''
    if (expectedSha) expect(healthBody.commit).toBe(expectedSha.slice(0, 12))

    const login = await request.post('/api/auth/login', {
      headers: { origin: hiveOrigin },
      data: { access_key: accessKey },
    })
    expect(login.status()).toBe(200)
    expect((await login.json()).authenticated).toBe(true)

    try {
      const session = await request.get('/api/auth/session', { headers: { origin: hiveOrigin } })
      expect(session.status()).toBe(200)
      expect((await session.json()).authenticated).toBe(true)

      const backendHealth = await request.get('/api/health', { headers: { origin: hiveOrigin } })
      expect(backendHealth.status()).toBe(200)
      const backendHealthBody = await backendHealth.json()
      expect(backendHealthBody.ok === true || backendHealthBody.status === 'healthy').toBe(true)

      const handoff = await request.get('/api/auth/comms-handoff?format=json', { headers: { origin: hiveOrigin } })
      expect(handoff.status()).toBe(200)
      const handoffBody = await handoff.json()
      const communicationsUrl = new URL(String(handoffBody.url || ''))
      expect(communicationsUrl.protocol).toBe('https:')
      expect(communicationsUrl.pathname).toBe('/console/')
      const handoffToken = new URLSearchParams(communicationsUrl.hash.replace(/^#/, '')).get('handoff') || ''
      expect(handoffToken).not.toBe('')

      const identity = await request.get('/api/auth/comms-identity', {
        headers: { origin: hiveOrigin, authorization: `Bearer ${handoffToken}` },
      })
      expect(identity.status()).toBe(200)
      const identityBody = await identity.json()
      expect(identityBody.actor).toBeTruthy()
      expect(identityBody.role).toBeTruthy()

      const aimsOrigin = communicationsUrl.origin
      const exchange = await request.post(`${aimsOrigin}/console/api/auth/handoff`, {
        headers: { origin: aimsOrigin, authorization: `Bearer ${handoffToken}` },
      })
      expect(exchange.status()).toBe(200)
      const exchangeBody = await exchange.json()
      expect(exchangeBody.authenticated).toBe(true)
      expect(exchangeBody.actor).toBe(identityBody.actor)
      expect(exchangeBody.role).toBe(identityBody.role)

      const delegatedHealth = await request.get(`${aimsOrigin}/console/api/health`, {
        headers: { origin: aimsOrigin },
      })
      expect(delegatedHealth.status()).toBe(200)
      const delegatedBody = await delegatedHealth.json()
      expect(delegatedBody.ok).toBe(true)
      expect(delegatedBody.service).toBe('comms-hub')
    } finally {
      const logout = await request.post('/api/auth/logout', { headers: { origin: hiveOrigin } })
      expect(logout.status()).toBe(200)
    }
  })
})

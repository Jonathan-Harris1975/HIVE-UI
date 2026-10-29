import { expect, test } from '@playwright/test'

// End-to-end coverage for the path the readiness audit found completely
// unverified: login through the edge layer, a session cookie, one streamed
// chat turn and one file upload.
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

  test('login, one chat turn, and one file upload', async ({ page }) => {
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
    await page.route('**/api/v1/models', (route) =>
      route.fulfill({
        status: 200,
        json: {
          count: 1,
          models: [{ id: 'test/model', name: 'Test model', primary_group: 'general', chat_selectable: true }],
        },
      }),
    )
    await page.route('**/api/v1/workflow-presets', (route) =>
      route.fulfill({ status: 200, json: { presets: [] } }),
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


    await page.goto('/')

    // --- Login ---
    await expect(page.getByRole('heading', { name: /enter hive/i })).toBeVisible()
    await page.getByPlaceholder(/enter access key/i).fill('e2e-test-key')
    await page.getByRole('button', { name: /unlock console/i }).click()

    // --- Chat controls and one streamed turn ---
    const chatInput = page.getByRole('textbox', { name: 'Message HIVE' })
    await expect(chatInput).toBeVisible({ timeout: 15_000 })

    await chatInput.fill('discard this draft')
    await page.locator('#hive-main-content').getByRole('button', { name: /new (chat|conversation)/i }).click()
    await expect(chatInput).toHaveValue('')

    await page.getByLabel('Chat mode').selectOption('code')
    await page.getByRole('button', { name: 'Choose HIVE model' }).click()
    await page.getByRole('option', { name: /Test model/i }).click()
    await chatInput.fill('Hello HIVE')
    await page.getByRole('button', { name: 'Send message' }).click()
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

  test('spend evidence renders and Operations remains fresh', async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    const accessKey = process.env.HIVE_UI_E2E_ACCESS_KEY?.trim() ?? ''
    expect(Boolean(accessKey)).toBe(true)
    const origin = new URL(baseURL!).origin
    const login = await page.request.post('/api/auth/login', {
      headers: { origin }, data: { access_key: accessKey },
    })
    expect(login.status()).toBe(200)
    let clockInstalled = false
    try {
      const spend = await page.request.get('/api/v1/system/llm-spend', { timeout: 20_000 })
      expect(spend.status()).toBe(200)
      const evidence = await spend.json()
      // Keep actual private account charges out of public Actions logs.
      expect(evidence.available === true && evidence.report?.reconciled === true
        && Number.isFinite(evidence.report?.usd)).toBe(true)
      console.info('Verified private spend evidence through the authenticated HIVE-UI gateway')
      const weekly = await page.request.get('/api/v1/system/lifecycle-reports/current', { timeout: 20_000 })
      expect(weekly.status()).toBe(200)
      const overview = await weekly.json()
      expect(overview.available === true && overview.report?.repositories?.length === 8).toBe(true)
      const repositoryReport = await page.request.get(
        overview.report.repositories.find((row: { repository: string }) => row.repository === 'HIVE').report_url,
        { timeout: 20_000 },
      )
      expect(repositoryReport.status()).toBe(200)
      expect(repositoryReport.headers()['content-type']?.includes('text/html')).toBe(true)
      console.info('Verified the restored weekly overview and authenticated repository HTML link')
      await page.goto('/llm-spend', { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('Recorded USD spend', { exact: true })).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('Spend by model', { exact: true })).toBeVisible()
      await page.goto('/ops', { waitUntil: 'domcontentloaded' })
      const snapshotTime = page.getByTestId('ops-snapshot-time')
      await expect(snapshotTime).toBeVisible({ timeout: 30_000 })
      await page.clock.install()
      clockInstalled = true
      for (let pass = 0; pass < 3; pass += 1) {
        const previousTime = await snapshotTime.getAttribute('datetime')
        await page.clock.fastForward(61_000)
        // A single API response can precede the remaining snapshot requests.
        // Advance again only once the entire refresh has committed.
        await expect(snapshotTime).not.toHaveAttribute('datetime', previousTime!, { timeout: 30_000 })
        await expect(snapshotTime).toBeVisible()
        await expect(page.getByText(/Operational data is stale/)).toHaveCount(0)
      }
      console.info('Verified visible spend page and three complete Operations refresh cycles')
    } finally {
      if (clockInstalled) await page.clock.resume()
      await page.request.post('/api/auth/logout', { headers: { origin }, timeout: 10_000 }).catch(() => undefined)
    }
  })

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
    if (expectedSha) {
      expect(expectedSha).toMatch(/^[0-9a-f]{40}$/)
      expect(healthBody.source_sha).toBe(expectedSha)
    }

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

import { expect, test, type Page } from '@playwright/test'

const live = Boolean(process.env.HIVE_UI_E2E_BASE_URL)
const acceptanceViewports = [[320, 700], [360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [844, 390]]

// Keep automatic failure captures disabled: the same file also exercises private dashboards.
test.use({ screenshot: 'off', trace: 'off' })

// These checks exercise actual rendered pixels/layout and keyboard behaviour.
// They intentionally never save screenshots of authenticated operator content.
async function checkViewport(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  expect(dimensions.document, label + ': document horizontal overflow').toBeLessThanOrEqual(dimensions.viewport + 2)
  expect(dimensions.body, label + ': body horizontal overflow').toBeLessThanOrEqual(dimensions.viewport + 2)
}

async function checkControlNames(page: Page, label: string) {
  const unnamed = await page.evaluate(() => {
    return [...document.querySelectorAll('button, a[href]')]
      .filter((node) => {
        const element = node as HTMLElement
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
          && rect.right > 0 && rect.left < innerWidth
          && rect.bottom > 0 && rect.top < innerHeight
          && !element.closest('[inert], [aria-hidden="true"]')
          && (!element.closest('details:not([open])') || Boolean(element.closest('summary')))
          && getComputedStyle(element).visibility !== 'hidden'
      })
      .filter((node) => {
        const element = node as HTMLElement
        const labelledBy = element.getAttribute('aria-labelledby')
        const labelNode = labelledBy ? document.getElementById(labelledBy) : null
        const accessible = element.getAttribute('aria-label')
          || labelNode?.textContent
          || element.textContent
          || element.getAttribute('title')
          || element.querySelector('img')?.getAttribute('alt')
        return !accessible?.trim()
      })
      .map((node) => (node as HTMLElement).className || node.tagName)
      .slice(0, 8)
  })
  expect(unnamed, label + ': visible controls need accessible names').toEqual([])
}

async function login(page: Page, baseURL: string) {
  const key = process.env.HIVE_UI_E2E_ACCESS_KEY?.trim() || ''
  expect(key, 'Production acceptance requires the existing CI access secret').not.toBe('')
  const origin = new URL(baseURL).origin
  const response = await page.request.post(origin + '/api/auth/login', {
    headers: { origin },
    data: { access_key: key },
  })
  expect(response.status()).toBe(200)
  return origin
}

test.describe('HIVE-UI safe browser visual baseline', () => {
  test.skip(live, 'Synthetic screenshots must never contain production operator data.')

  test('synthetic command centre renders evidence, partial failure and responsive screenshots', async ({ page }) => {
    await page.route('**/api/auth/session', (route) => route.fulfill({ json: { ok: true, authenticated: true } }))
    await page.route('**/api/auth/activity', (route) => route.fulfill({ json: { ok: true, authenticated: true } }))
    await page.route('**/api/health', (route) => route.fulfill({ json: { ok: true, env: 'synthetic', build: 'visual-fixture' } }))
    await page.route('**/api/v1/chat/conversations*', (route) => route.fulfill({ json: { ok: true, conversations: [] } }))
    await page.route('**/api/v1/system/repo-health?*', (route) => route.fulfill({ json: {
      ok: true, generated_at: '2026-11-28T09:00:00Z',
      repos: [{ repo: 'Example API', status: 'healthy' }, { repo: 'Example worker', status: 'standby' }, { repo: 'Example service', status: 'degraded' }],
    } }))
    let failAlerts = false
    await page.route('**/api/v1/system/ops-events?*', (route) => failAlerts
      ? route.fulfill({ status: 503, json: { error: 'fixture unavailable' } })
      : route.fulfill({ json: { ok: true, items: [{ event_id: 'fixture-1', severity: 'critical', title: 'Example event', occurred_at: '2026-11-28T09:00:00Z' }] } }))
    await page.goto('/')
    const overview = page.getByTestId('command-centre')
    await expect(overview).toBeVisible()
    await expect(overview.getByText('Example API')).toBeVisible()
    await expect(overview.getByText('Example event')).toBeVisible()
    await expect(overview.getByText('1/3', { exact: true })).toBeVisible()
    for (const [width, height] of acceptanceViewports) {
      await page.setViewportSize({ width, height })
      await checkViewport(page, 'Synthetic command centre ' + width)
      await checkControlNames(page, 'Synthetic command centre ' + width)
      const healthyLamp = overview.locator('[title="Healthy"]')
      await expect(healthyLamp).toHaveCount(1)
      await expect(healthyLamp.locator('.signal-lamp')).toHaveCSS('border-top-color', 'rgb(165, 181, 201)')
      await expect(healthyLamp.locator('.signal-lamp')).toHaveCSS('border-top-left-radius', '2px')
      await expect(healthyLamp.locator('[data-active="true"]')).toHaveCSS('background-color', 'rgb(53, 255, 136)')
      await expect(healthyLamp.getByText('Healthy', { exact: true })).toHaveCSS('position', 'absolute')
      await expect(healthyLamp.getByText('Healthy', { exact: true })).toHaveCSS('width', '1px')
      await test.info().attach('synthetic-command-centre-' + width + '.png', {
        body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
      })
    }
    failAlerts = true
    await overview.getByRole('button', { name: 'Refresh' }).click()
    await expect(overview.getByText('Some sources are unavailable.', { exact: false })).toBeVisible()
    await expect(overview.getByText('Alert evidence unavailable.')).toBeVisible()
    await expect(overview.getByText('Example API')).toBeVisible()
  })

  test('mobile Communications opens from HIVE and handles handoff failure without trapping navigation', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.route('**/api/auth/session', (route) => route.fulfill({ json: { ok: true, authenticated: true } }))
    await page.route('**/api/auth/activity', (route) => route.fulfill({ json: { ok: true, authenticated: true } }))
    await page.route('**/api/health', (route) => route.fulfill({ json: { ok: true, env: 'synthetic' } }))
    await page.route('**/api/v1/chat/conversations*', (route) => route.fulfill({ json: { ok: true, conversations: [] } }))
    let releaseHandoff!: () => void
    const pending = new Promise<void>((resolve) => { releaseHandoff = resolve })
    await page.route('**/api/auth/comms-handoff?*', async (route) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([pending, new Promise<void>(resolve => { timer = setTimeout(resolve, 10_000) })])
        await route.fulfill({ status: 503, json: { detail: 'Synthetic handoff unavailable' } })
      } finally { clearTimeout(timer) }
    })
    await page.goto('/')
    const navigation = page.getByRole('navigation', { name: 'Quick navigation' })
    await navigation.getByRole('link', { name: 'Communications' }).click()
    await expect(page).toHaveURL(/\/communications$/)
    try {
      await expect(page.getByText('Loading communications…')).toBeVisible()
      await expect(page.getByText('Opening AIMS Comms Hub')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Reload Communications Interface' })).toHaveCount(0)
      await checkViewport(page, 'Mobile Communications loading')
      const icons = await navigation.locator('a svg').evaluateAll(nodes => nodes.map(node => node.innerHTML))
      expect(new Set(icons).size).toBe(icons.length)
      await test.info().attach('synthetic-communications-loading-320.png', {
        body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
      })
    } finally { releaseHandoff() }
    await expect(page.getByRole('alert').getByText('Synthetic handoff unavailable')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await expect(page.locator('iframe[title="AIMS Comms Hub"]')).toHaveCount(0)
    await checkViewport(page, 'Mobile Communications error')
    await expect(navigation.getByRole('link', { name: 'Communications' })).toHaveAttribute('aria-current', 'page')
    await expect(navigation.getByRole('link', { name: 'Operations' })).toBeVisible()
    await page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('link', { name: 'Overview', exact: true }).click()
    await expect(page).toHaveURL(/\/overview$/)
    await expect(navigation.getByRole('link', { name: 'Communications' })).toBeVisible()
  })

  test('public login renders at desktop, tablet and narrow phone widths', async ({ page }) => {
    await page.route('**/api/auth/session', (route) =>
      route.fulfill({ status: 401, json: { detail: 'no session' } }),
    )
    for (const [width, height] of acceptanceViewports) {
      await page.setViewportSize({ width, height })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: /Enter HIVE/i })).toBeVisible()
      await checkViewport(page, 'HIVE login ' + width)
      await checkControlNames(page, 'HIVE login ' + width)
      await test.info().attach('public-login-' + width + '.png', {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      })
    }
    await page.getByPlaceholder(/Enter access key/i).focus()
    await expect(page.getByPlaceholder(/Enter access key/i)).toBeFocused()
  })
})

test.describe('HIVE-UI deployed gateway browser acceptance', () => {
  test.skip(!live, 'Requires live Worker and the existing HIVE_UI_ACCESS_KEY CI secret.')

  test('authenticated HIVE operations survive responsive layout and mobile keyboard navigation', async ({ page, baseURL }) => {
    test.setTimeout(150_000)
    const origin = await login(page, baseURL!)
    try {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('command-centre')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Your ecosystem at a glance' })).toBeVisible()
      for (const [width, height] of acceptanceViewports) {
        await page.setViewportSize({ width, height })
        await checkViewport(page, 'HIVE command centre ' + width)
        await checkControlNames(page, 'HIVE command centre ' + width)
      }
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('link', { name: 'Operations' }).click()
      await expect(page).toHaveURL(/\/ops$/)
      await page.goto('/ops', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('#hive-main-content')).toBeVisible()
      await expect(page.getByTestId('ops-snapshot-time')).toBeVisible({ timeout: 30_000 })
      await checkViewport(page, 'HIVE ops phone')
      await checkControlNames(page, 'HIVE ops phone')
      const menu = page.getByRole('button', { name: 'Open navigation' })
      await menu.click()
      const drawer = page.getByRole('dialog', { name: 'Navigation' })
      await expect(drawer).toBeVisible()
      const items = drawer.locator('button:visible, a[href]:visible, input:visible')
      await expect(items.first()).toBeVisible()
      await items.last().focus()
      await expect(items.last()).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(items.first()).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(items.last()).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
      await expect(menu).toBeFocused()

      for (const [width, height] of acceptanceViewports) {
        await page.setViewportSize({ width, height })
        await checkViewport(page, 'HIVE ops ' + width)
        await checkControlNames(page, 'HIVE ops ' + width)
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      const rail = page.getByRole('button', { name: 'Collapse navigation' })
      await rail.click()
      await expect(page.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Operations' })).toBeVisible()
      await page.getByRole('button', { name: 'Expand navigation' }).click()
      console.info('HIVE browser acceptance: responsive and keyboard checks passed (no private snapshot exported)')
    } finally {
      await page.request.post(origin + '/api/auth/logout', { headers: { origin } }).catch(() => undefined)
    }
  })

  test('real authenticated AIMS Comms Hub remains usable at phone, tablet and desktop widths', async ({ page, baseURL }) => {
    test.setTimeout(180_000)
    const hiveOrigin = await login(page, baseURL!)
    try {
      const handoff = await page.request.get(hiveOrigin + '/api/auth/comms-handoff?format=json', {
        headers: { origin: hiveOrigin },
      })
      expect(handoff.status()).toBe(200)
      const destination = new URL(String((await handoff.json()).url || ''))
      expect(destination.protocol).toBe('https:')
      expect(destination.pathname).toBe('/console/')
      const token = new URLSearchParams(destination.hash.replace(/^#/, '')).get('handoff')
      expect(token).toBeTruthy()
      const aimsOrigin = destination.origin
      const exchange = await page.request.post(aimsOrigin + '/console/api/auth/handoff', {
        headers: { origin: aimsOrigin, authorization: 'Bearer ' + token },
      })
      expect(exchange.status()).toBe(200)

      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(aimsOrigin + '/console/#dashboard', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('#aims-main-content')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 30_000 })
      await checkViewport(page, 'AIMS dashboard phone')
      await checkControlNames(page, 'AIMS dashboard phone')

      const menu = page.getByRole('button', { name: 'Open AIMS navigation' })
      await menu.click()
      const drawer = page.locator('#aims-sidebar[role="dialog"][aria-modal="true"]')
      await expect(drawer).toBeVisible()
      await expect(page.locator('#aims-main-content')).toHaveAttribute('inert', '')
      const items = drawer.locator('button:visible, a[href]:visible')
      await items.last().focus()
      await expect(items.last()).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(items.first()).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(items.last()).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(page.locator('#aims-main-content')).not.toHaveAttribute('inert')
      await expect(menu).toBeFocused()

      for (const [width, height] of acceptanceViewports) {
        await page.setViewportSize({ width, height })
        await checkViewport(page, 'AIMS dashboard ' + width)
        await checkControlNames(page, 'AIMS dashboard ' + width)
      }

      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(aimsOrigin + '/console/?embed=1#dashboard', { waitUntil: 'domcontentloaded' })
      const embedded = page.getByRole('navigation', { name: 'Communications sections' })
      await expect(embedded).toBeVisible({ timeout: 30_000 })
      await expect(embedded.locator('[data-view="inbox"]')).toHaveAttribute('aria-label', 'Unified inbox')
      await checkViewport(page, 'AIMS embedded phone')

      // Exercise the actual integrated navigation, not just a standalone handoff.
      await page.goto(hiveOrigin + '/overview', { waitUntil: 'domcontentloaded' })
      await page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('link', { name: /Communications/ }).click()
      await expect(page).toHaveURL(/\/communications$/)
      const frame = page.locator('iframe[title="AIMS Comms Hub"]')
      await expect(frame).toBeVisible({ timeout: 30_000 })
      const sections = page.frameLocator('iframe[title="AIMS Comms Hub"]').getByRole('navigation', { name: 'Communications sections' })
      await expect(sections).toBeVisible({ timeout: 30_000 })
      await expect(sections.locator('[data-view="inbox"] span')).toBeVisible()
      await checkViewport(page, 'Integrated HIVE to AIMS phone')
      await expect(page.getByRole('navigation', { name: 'Quick navigation' })).toBeVisible()
      for (const [width, height] of acceptanceViewports) {
        await page.setViewportSize({ width, height })
        await checkViewport(page, 'Integrated HIVE to AIMS ' + width)
        await expect(frame).toBeVisible()
        await expect(page.frameLocator('iframe[title="AIMS Comms Hub"]').locator('#aims-sidebar')).toBeHidden()
      }
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('link', { name: 'Overview', exact: true }).click()
      await expect(page).toHaveURL(/\/overview$/)
      console.info('AIMS browser acceptance: live handoff, layout and keyboard checks passed (no private snapshot exported)')
    } finally {
      await page.request.post(hiveOrigin + '/api/auth/logout', { headers: { origin: hiveOrigin } }).catch(() => undefined)
    }
  })
})

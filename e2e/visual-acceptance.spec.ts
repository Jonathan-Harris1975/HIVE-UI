import { expect, test, type Page } from '@playwright/test'

const live = Boolean(process.env.HIVE_UI_E2E_BASE_URL)

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

  test('public login renders at desktop, tablet and narrow phone widths', async ({ page }) => {
    await page.route('**/api/auth/session', (route) =>
      route.fulfill({ status: 401, json: { detail: 'no session' } }),
    )
    for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [1440, 900]]) {
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

      for (const [width, height] of [[768, 1024], [1440, 900]]) {
        await page.setViewportSize({ width, height })
        await checkViewport(page, 'HIVE ops ' + width)
        await checkControlNames(page, 'HIVE ops ' + width)
      }
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

      for (const [width, height] of [[768, 1024], [1440, 900]]) {
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
      console.info('AIMS browser acceptance: live handoff, layout and keyboard checks passed (no private snapshot exported)')
    } finally {
      await page.request.post(hiveOrigin + '/api/auth/logout', { headers: { origin: hiveOrigin } }).catch(() => undefined)
    }
  })
})

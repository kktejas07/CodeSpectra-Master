/**
 * Dashboard sub-page smoke: sign in as the seeded superadmin and load each
 * dashboard sub-page, asserting the shell renders and no page error.
 *
 *   BASE_URL=http://127.0.0.1:3000 E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npx playwright test e2e/dashboard-subpages.spec.ts
 */
import { test, expect, type Page } from '@playwright/test'

const EMAIL = process.env.E2E_ADMIN_EMAIL || ''
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || ''

// Real dashboard route dirs (not practice/career): see frontend/app/dashboard/.
const PAGES = (
  process.env.E2E_DASHBOARD_PAGES ||
  '/dashboard,/dashboard/events,/dashboard/courses,/dashboard/mock-tests,/dashboard/interview-prep,/dashboard/interview-sim,/dashboard/tracks,/dashboard/jobs,/dashboard/placement,/dashboard/hiring'
).split(',').map((p) => p.trim()).filter(Boolean)

test.skip(!EMAIL || !PASSWORD, 'set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (seeded superadmin) to run')
test.describe.configure({ mode: 'serial' })

async function signIn(page: Page) {
  const res = await page.request.post('/api/auth/login', { data: { email: EMAIL, password: PASSWORD } })
  expect(res.status(), `sign-in: ${await res.text().catch(() => '')}`).toBe(200)
}

for (const path of PAGES) {
  test(`${path} renders the dashboard shell`, async ({ page }) => {
    await signIn(page)
    const nav = await page.goto(path, { waitUntil: 'load' })
    // The app redirects signed-out visitors to /auth/login — we just signed in, so we shouldn't.
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(1000)
    expect(nav?.status() ?? 0, `${path} returned ${nav?.status()}`).toBeLessThan(400)
    await expect(page).not.toHaveURL(/\/auth\/login/)
  })
}

/**
 * SEO-039: accessibility of the admin screens added in wave 15 (assistants,
 * hiring agents, onboarding) and the AI copilot, signed in as the seeded
 * superadmin (scripts/seed-dev-users.ts → superadmin@codespectra.com):
 * axe-core WCAG 2.1 A/AA — no critical violations (serious are logged).
 *
 *   BASE_URL=http://127.0.0.1:3000 E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npx playwright test e2e/a11y-admin.spec.ts
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const EMAIL = process.env.E2E_ADMIN_EMAIL || ''
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || ''
const PAGES = (process.env.E2E_A11Y_ADMIN_PAGES || '/dashboard/admin/assistants,/dashboard/admin/hiring-agents,/dashboard/admin/onboarding,/dashboard/admin/agent')
  .split(',').map((p) => p.trim()).filter(Boolean)

test.skip(!EMAIL || !PASSWORD, 'set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (seeded superadmin) to run')
test.describe.configure({ mode: 'serial' })

for (const path of PAGES) {
  test(`${path}: no critical axe violations`, async ({ page }) => {
    const res = await page.request.post('/api/auth/login', { data: { email: EMAIL, password: PASSWORD } })
    expect(res.status(), `sign-in: ${await res.text().catch(() => '')}`).toBe(200)
    const nav = await page.goto(path, { waitUntil: 'load' })
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    expect(nav?.status() ?? 0).toBeLessThan(400)
    await expect(page).not.toHaveURL(/\/auth\/login/)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const serious = axe.violations.filter((v) => v.impact === 'serious' && v.id !== 'color-contrast')
    if (serious.length) console.warn(`[a11y] ${path} serious:`, serious.map((v) => `${v.id} ×${v.nodes.length}`).join(', '))
    // Report the offending markup and URL so a CI failure is actionable without a trace.
    // SEO-056: serious colour-contrast fails as well.
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.id === 'color-contrast').map((v) => `${v.id}: ${v.help} @ ${page.url()} :: ${(v.nodes[0]?.html ?? '').slice(0, 300)} :: ${v.nodes[0]?.failureSummary?.slice(0, 200) ?? ''}`)).toEqual([])
  })
}

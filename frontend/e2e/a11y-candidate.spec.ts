/**
 * SEO-039: accessibility of the signed-in candidate screens (the public crawl
 * never reaches them). Signs in a seeded candidate (scripts/seed-dev-users.ts
 * → demo@codespectra.com) and, on the dashboard and the demo test workspace:
 *  - axe-core (WCAG 2.1 A/AA): no critical violations (serious are logged),
 *  - a Tab-only pass: focus moves forward, never lands on hidden elements and
 *    every stop shows a visible focus indicator.
 *
 * Runs only when E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD are set (CI seeds
 * them with a throwaway password):
 *   BASE_URL=http://127.0.0.1:3000 E2E_CANDIDATE_EMAIL=… E2E_CANDIDATE_PASSWORD=… npx playwright test e2e/a11y-candidate.spec.ts
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const EMAIL = process.env.E2E_CANDIDATE_EMAIL || ''
const PASSWORD = process.env.E2E_CANDIDATE_PASSWORD || ''
const PAGES = (process.env.E2E_A11Y_PAGES || '/dashboard,/assessment/demo/cad').split(',').map((p) => p.trim()).filter(Boolean)

test.skip(!EMAIL || !PASSWORD, 'set E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD (seeded candidate) to run')
test.describe.configure({ mode: 'serial' })

async function signIn(page: Page) {
  const res = await page.request.post('/api/auth/login', { data: { email: EMAIL, password: PASSWORD } })
  expect(res.status(), `sign-in: ${await res.text().catch(() => '')}`).toBe(200)
}

async function tabPass(page: Page, stops = 40) {
  const seen: string[] = []
  const problems: string[] = []
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab')
    const f = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none')
      const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 60)
      return { key: `${el.tagName}:${label}:${Math.round(r.x)}:${Math.round(r.y)}`, label, hidden: r.width === 0 || r.height === 0 || cs.visibility === 'hidden', ring: !!ring }
    })
    if (!f) { problems.push(`stop ${i + 1}: focus on <body> (lost)`); break }
    if (f.hidden) problems.push(`stop ${i + 1}: hidden element focused (${f.label})`)
    if (!f.ring) problems.push(`stop ${i + 1}: no visible focus indicator (${f.label})`)
    if (seen.includes(f.key)) break // wrapped around: the whole page was reachable
    seen.push(f.key)
  }
  return { stops: seen.length, problems }
}

for (const path of PAGES) {
  test(`${path}: no critical axe violations, keyboard reachable`, async ({ page }) => {
    await signIn(page)
    const res = await page.goto(path, { waitUntil: 'networkidle' })
    expect(res?.status() ?? 0).toBeLessThan(400)
    await expect(page).not.toHaveURL(/\/auth\/login/)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const critical = axe.violations.filter((v) => v.impact === 'critical')
    const serious = axe.violations.filter((v) => v.impact === 'serious')
    if (serious.length) console.warn(`[a11y] ${path} serious:`, serious.map((v) => `${v.id} ×${v.nodes.length}`).join(', '))
    expect(critical.map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.target?.[0] ?? ''})`)).toEqual([])
    const kb = await tabPass(page)
    expect(kb.stops, 'Tab reaches interactive elements').toBeGreaterThan(0)
    expect(kb.problems).toEqual([])
  })
}

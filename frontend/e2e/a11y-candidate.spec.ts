/**
 * SEO-039: accessibility of the signed-in candidate screens (the public crawl
 * never reaches them). Signs in a seeded candidate (scripts/seed-dev-users.ts
 * → demo@codespectra.com) and, on the dashboard and the demo test workspace:
 *  - axe-core (WCAG 2.1 A/AA): no critical violations and no colour-contrast
 *    ones (other serious ones are logged),
 *  - a Tab-only pass: focus moves forward, never lands on hidden elements and
 *    every stop shows a visible focus indicator.
 *
 * The real test screen is covered too: scripts/seed-a11y-assessment.ts seeds a
 * published assessment with one question of every type (/assessment/<A11Y_EXAM_ID>);
 * after the start screen the spec starts it (best effort) and checks the
 * question screen as well. Admin screens: e2e/a11y-admin.spec.ts.
 *
 * Runs only when E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD are set (CI seeds
 * them with a throwaway password):
 *   BASE_URL=http://127.0.0.1:3000 E2E_CANDIDATE_EMAIL=… E2E_CANDIDATE_PASSWORD=… npx playwright test e2e/a11y-candidate.spec.ts
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Same id as scripts/fixtures/a11y-assessment.ts (A11Y_EXAM_ID; checked in tests/seo-audit6-fixes.test.ts). */
const A11Y_EXAM_ID = 'a11y-all-question-types'

const EMAIL = process.env.E2E_CANDIDATE_EMAIL || ''
const PASSWORD = process.env.E2E_CANDIDATE_PASSWORD || ''
const PAGES = (process.env.E2E_A11Y_PAGES || `/dashboard,/assessment/demo/cad,/assessment/${A11Y_EXAM_ID}`).split(',').map((p) => p.trim()).filter(Boolean)

test.skip(!EMAIL || !PASSWORD, 'set E2E_CANDIDATE_EMAIL / E2E_CANDIDATE_PASSWORD (seeded candidate) to run')
test.describe.configure({ mode: 'serial' })

async function signIn(page: Page) {
  const res = await page.request.post('/api/auth/login', { data: { email: EMAIL, password: PASSWORD } })
  expect(res.status(), `sign-in: ${await res.text().catch(() => '')}`).toBe(200)
}

async function expectNoCritical(page: Page, label: string) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  // SEO-056: serious colour-contrast fails as well (other serious rules are logged).
  const critical = axe.violations.filter((v) => v.impact === 'critical' || v.id === 'color-contrast')
  const serious = axe.violations.filter((v) => v.impact === 'serious' && v.id !== 'color-contrast')
  if (serious.length) console.warn(`[a11y] ${label} serious:`, serious.map((v) => `${v.id} ×${v.nodes.length}`).join(', '))
  expect(critical.map((v) => `${v.id}: ${v.help} @ ${page.url()} :: ${(v.nodes[0]?.html ?? '').slice(0, 300)}`), label).toEqual([])
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
    // The dashboard polls (notifications, presence), so 'networkidle' never
    // settles: wait for the document, then for the main landmark to render.
    const res = await page.goto(path, { waitUntil: 'load' })
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    expect(res?.status() ?? 0).toBeLessThan(400)
    await expect(page).not.toHaveURL(/\/auth\/login/)
    // The test screen sends the candidate home when the exam can't be loaded;
    // say why instead of silently checking the landing page.
    if (path.startsWith('/assessment/') && !path.includes('/demo/') && new URL(page.url()).pathname !== path) {
      const api = await page.request.get(`/api/exams/${path.split('/').pop()}`)
      throw new Error(`${path} redirected to ${page.url()} — GET /api/exams → ${api.status()} ${(await api.text()).slice(0, 300)}`)
    }
    await expectNoCritical(page, path)
    // Test screen: get past the start / consent step to the questions (best effort —
    // the start screen itself was checked above).
    if (path.startsWith('/assessment/') && !path.includes('/demo/')) {
      const consent = page.getByRole('checkbox').first()
      if (await consent.isVisible().catch(() => false)) await consent.check().catch(() => {})
      const start = page.getByRole('button', { name: /start|begin|continue/i }).first()
      if (await start.isVisible().catch(() => false)) {
        await start.click().catch(() => {})
        await page.waitForTimeout(2500)
        await expectNoCritical(page, `${path} (questions)`)
      }
    }
    // The first-visit tour now loads lazily (SEO-050) and can open just as the
    // Tab pass starts; while its highlight animates, driver.js traps Tab with
    // no popover to focus yet. Let it settle: either the popover is up, or no
    // tour is running.
    const settle = async () => {
      await page.waitForFunction(() => {
        if (!document.body.classList.contains('driver-active')) return true
        const pop = document.querySelector('.driver-popover') as HTMLElement | null
        return !!pop && pop.getBoundingClientRect().height > 0 && !!pop.querySelector('button')
      }, undefined, { timeout: 8_000 }).catch(() => {})
      await page.waitForTimeout(500)
    }
    await settle()
    let kb = await tabPass(page)
    // The tour opened mid-pass (focus lost to <body> on the very first stop):
    // let it settle and run the pass again — the result must still be clean.
    if (kb.stops === 0) { await settle(); kb = await tabPass(page) }
    expect(kb.stops, 'Tab reaches interactive elements').toBeGreaterThan(0)
    expect(kb.problems).toEqual([])
  })
}

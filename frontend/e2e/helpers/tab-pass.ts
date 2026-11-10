/**
 * Tab-only keyboard pass shared by the candidate/admin accessibility specs.
 *
 * Focus leaving the document (`activeElement === body`) is the browser's normal
 * behaviour once the LAST tabbable element is passed — Chromium moves focus to
 * its own chrome, not to a DOM node. That is a clean end of the page, not a bug:
 * /assessment/demo/cad has 34 tabbables, so the 35th Tab always "lost" focus and
 * the spec failed on a perfectly keyboard-reachable page. It is only a real
 * failure when something tabbable still comes after the last stop (focus dropped
 * mid-page) or the last stop was removed from the DOM on focus.
 *
 * Regression guard: e2e/tab-pass.spec.ts drives both the clean-end and the
 * mid-page-loss fixtures.
 */
import type { Page } from '@playwright/test'

/** Selector for everything the browser puts in the Tab order. */
export const TABBABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]'

type FocusProbe =
  | { lost: true; atEnd: boolean; remaining: number }
  | { lost: false; key: string; label: string; hidden: boolean; ring: boolean }

export async function tabPass(page: Page, stops = 40): Promise<{ stops: number; problems: string[] }> {
  const seen: string[] = []
  const problems: string[] = []
  await page.evaluate(() => {
    ;(window as unknown as { __a11yLastFocused?: Element | null }).__a11yLastFocused = null
  })
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab')
    const f: FocusProbe = await page.evaluate((tabbable) => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) {
        const list = Array.from(document.querySelectorAll<HTMLElement>(tabbable)).filter((n) => {
          const r = n.getBoundingClientRect()
          const cs = getComputedStyle(n)
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && n.getAttribute('aria-hidden') !== 'true'
        })
        const last = (window as unknown as { __a11yLastFocused?: Element | null }).__a11yLastFocused
        const idx = last ? list.indexOf(last as HTMLElement) : -1
        // -1 = the last stop was detached from the DOM; not the end of the page.
        return { lost: true, atEnd: idx >= 0 && idx === list.length - 1, remaining: idx < 0 ? -1 : list.length - 1 - idx }
      }
      ;(window as unknown as { __a11yLastFocused?: Element | null }).__a11yLastFocused = el
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none')
      const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 60)
      return { lost: false, key: `${el.tagName}:${label}:${Math.round(r.x)}:${Math.round(r.y)}`, label, hidden: r.width === 0 || r.height === 0 || cs.visibility === 'hidden', ring: !!ring }
    }, TABBABLE)
    if (f.lost) {
      if (!f.atEnd) {
        problems.push(
          f.remaining < 0
            ? `stop ${i + 1}: focus on <body> (last focused element left the DOM)`
            : `stop ${i + 1}: focus on <body> (${f.remaining} tabbable element(s) still unreachable)`,
        )
      }
      break
    }
    if (f.hidden) problems.push(`stop ${i + 1}: hidden element focused (${f.label})`)
    if (!f.ring) problems.push(`stop ${i + 1}: no visible focus indicator (${f.label})`)
    if (seen.includes(f.key)) break // wrapped around: the whole page was reachable
    seen.push(f.key)
  }
  return { stops: seen.length, problems }
}

/**
 * Regression guard for e2e/helpers/tab-pass.ts (used by the candidate and admin
 * a11y specs). The helper must:
 *   - accept the browser's normal "focus left the document" after the LAST
 *     tabbable element (this is the /assessment/demo/cad case), and
 *   - still fail when focus is dropped mid-page, e.g. because the focused
 *     element removed itself from the DOM.
 *
 * No app, no sign-in needed: plain fixtures via page.setContent.
 */
import { test, expect } from '@playwright/test'
import { tabPass } from './helpers/tab-pass'

const RING = '<style>button:focus-visible{outline:2px solid #000}</style>'

test('a page whose Tab order ends cleanly passes', async ({ page }) => {
  await page.setContent(`${RING}<main><button>one</button><button>two</button><button>three</button></main>`)
  const pass = await tabPass(page, 10)
  expect(pass.problems).toEqual([])
  expect(pass.stops).toBe(3)
})

test('focus dropped mid-page is still a failure', async ({ page }) => {
  await page.setContent(
    `${RING}<main><button>one</button><button id="gone">two</button><button>three</button></main>
     <script>document.getElementById('gone').addEventListener('focus', (e) => e.currentTarget.remove())</script>`,
  )
  const pass = await tabPass(page, 10)
  expect(pass.problems.length).toBeGreaterThan(0)
  expect(pass.problems[0]).toMatch(/focus on <body>.*unreachable|left the DOM/)
})

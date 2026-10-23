/**
 * SEO-044: no new hard-coded English in the admin console JSX — app/dashboard/admin
 * and the components only it renders (components/agent = the AI copilot,
 * components/admin, components/support, components/study-plan). Same heuristic
 * scan as tests/i18n-app-areas.test.ts, with its own per-file allow-list
 * (tests/fixtures/i18n-jsx-admin-allowlist.json) whose total may only shrink.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { hardCodedText, listAdminFiles, ROOT } from './i18n-jsx-scan'

type Allow = Record<string, { why: string; text: string[] } | string>
const ALLOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/i18n-jsx-admin-allowlist.json'), 'utf8')) as Allow

/** Lower this whenever entries are translated, never raise it. Was 3,393 before the copilot / team / assessments pass. */
const CAP = 3211

/** Fully translated: may never get an allow-list entry. */
const MUST_BE_CLEAN = ['components/agent/', 'app/dashboard/admin/agent/', 'components/support/', 'components/study-plan/', 'app/dashboard/admin/team/', 'app/dashboard/admin/assessments/pipeline/']

describe('no new hard-coded English in the admin console JSX', () => {
  const files = listAdminFiles()

  it('scans the admin console, the copilot and admin widgets', () => {
    expect(files.length).toBeGreaterThan(100)
    for (const d of ['app/dashboard/admin/', 'components/agent/', 'components/admin/', 'components/support/']) expect(files.some((f) => f.startsWith(d)), d).toBe(true)
  })

  it('every JSX text / text prop goes through useAdminT() or is allow-listed', () => {
    const problems: string[] = []
    for (const f of files) {
      const entry = ALLOW[f]
      const allowed = new Set(typeof entry === 'object' ? entry.text : [])
      for (const s of hardCodedText(f)) if (!allowed.has(s)) problems.push(`${f}: ${JSON.stringify(s)}`)
    }
    expect(problems, 'wrap these in t() from useAdminT (add keys to lib/i18n/messages/*/admin.json)').toEqual([])
  }, 60_000)

  it('the copilot and the translated org-admin screens stay fully translated', () => {
    expect(Object.keys(ALLOW).filter((f) => MUST_BE_CLEAN.some((d) => f.startsWith(d)))).toEqual([])
  })

  it('allow-list only shrinks', () => {
    const total = Object.entries(ALLOW).reduce((n, [f, e]) => n + (f.startsWith('_') || typeof e !== 'object' ? 0 : e.text.length), 0)
    expect(total).toBeLessThanOrEqual(CAP)
  })

  it('allow-list has no stale entries', () => {
    const stale: string[] = []
    for (const [f, entry] of Object.entries(ALLOW)) {
      if (f.startsWith('_') || typeof entry !== 'object') continue
      if (!fs.existsSync(path.join(ROOT, f))) { stale.push(`${f} (file gone)`); continue }
      const now = new Set(hardCodedText(f))
      for (const s of entry.text) if (!now.has(s)) stale.push(`${f}: ${JSON.stringify(s)}`)
    }
    expect(stale, 'translated? remove the string from the allow-list and lower CAP').toEqual([])
  }, 60_000)
})

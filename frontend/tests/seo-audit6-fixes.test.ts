/**
 * Audit-6 SEO / i18n / a11y fixes (SEO-039, 042, 044–051). The JSX scans live
 * in tests/i18n-app-areas.test.ts + tests/i18n-admin-jsx.test.ts and the email
 * ratchets in tests/i18n-outbound.test.ts (SEO-033).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const json = (l: string, ns: string) => JSON.parse(read(`lib/i18n/messages/${l}/${ns}.json`)) as Record<string, string>
const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const SCRIPT = { hi: /[ऀ-ॿ]/, te: /[ఀ-౿]/ } as const

describe('SEO-051: team invite links are never indexed', () => {
  it('the invites segment exports private metadata', async () => {
    const { metadata } = await import('@/app/dashboard/team/invites/layout')
    expect(metadata.robots).toMatchObject({ index: false, follow: false })
    expect(metadata.referrer).toBe('no-referrer')
  })
})

describe('SEO-046: Enter does not send while an IME is composing', () => {
  for (const f of ['components/support/support-assistant.tsx', 'components/ai/ask-codespectra.tsx', 'app/dashboard/community/groups/[id]/page.tsx', 'components/agent/agent-copilot.tsx']) {
    it(f, () => {
      for (const m of read(f).matchAll(/e\.key === 'Enter'[^\n]*/g)) expect(m[0]).toContain('isComposing')
    })
  }
})

describe('SEO-049: each hiring agent switch is named after the agent', () => {
  it('uses the enableAgent label with the loop name and hides the On/Off text', () => {
    const src = read('app/dashboard/admin/hiring-agents/page.tsx')
    expect(src).toMatch(/<Switch id=\{id\('on'\)\} aria-label=\{t\('agentLoops\.enableAgent', \{ name: L\(`loop\.\$\{a\.loop\}\.name`\) \}\)\}/)
    expect(src).not.toMatch(/<Label htmlFor=\{id\('on'\)\}>/)
    for (const l of ['en', 'hi', 'te']) expect(json(l, 'admin')['agentLoops.enableAgent']).toContain('{name}')
  })
})

describe('SEO-050: the tour library is not in the shared bundle', () => {
  it('driver.js and its CSS load lazily', () => {
    const driver = read('lib/tour-driver.ts')
    expect(driver).not.toMatch(/^import \{[^}]*\} from 'driver\.js/m)
    expect(driver).toContain("import('./tour-engine')")
    expect(read('app/layout.tsx')).not.toMatch(/driver\.js\/dist|driver-tour\.css/)
    expect(read('lib/tour-engine.ts')).toContain("import 'driver.js/dist/driver.css'")
  })
})

describe('SEO-048: landing product tiles have no hard-coded English samples', () => {
  it('sample sentences come from landing.json in every language', () => {
    const src = read('components/landing/product-bento.tsx')
    for (const s of ['What does git rebase do?', 'Question 4 of 20', 'Graduate engineer trainee', 'URL shortener', 'Which data structure']) expect(src).not.toContain(s)
    for (const k of ['bentoSampleQuestion', 'bentoSampleProgress', 'bentoSampleRole', 'bentoSampleInterviewQ', 'bentoSampleWhatsappQ']) {
      for (const l of ['hi', 'te'] as const) expect(SCRIPT[l].test(json(l, 'landing')[k]), `${l}.${k}`).toBe(true)
    }
  })
})

describe('SEO-045: help-assistant records in the user\'s language', () => {
  it('every fact key exists in hi / te with the same placeholders', async () => {
    const { FACT_TABLES } = await import('@/lib/assistants/support/facts')
    const en = FACT_TABLES.en
    for (const l of ['hi', 'te'] as const) {
      expect(Object.keys(FACT_TABLES[l]).sort()).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(en)) {
        expect(slots(FACT_TABLES[l][k]), `${l}.${k}`).toEqual(slots(v))
        if (!k.startsWith('e.') || /[a-z]{3}/.test(v)) expect(SCRIPT[l].test(FACT_TABLES[l][k]), `${l}.${k}`).toBe(true)
      }
    }
  })

  it('renders English as before and Hindi / Telugu with local dates', async () => {
    const { renderFact } = await import('@/lib/assistants/support/facts')
    const plan = { key: 'plan' as const, params: { plan: 'pro', state: { e: 'active' }, renew: { e: 'renews' } }, dates: { ends: '2026-11-30T00:00:00Z' } }
    expect(renderFact(plan, 'en')).toBe('Plan: pro; state active; current period ends 2026-11-30; renews automatically.')
    expect(renderFact({ key: 'credits', params: { balance: 40, allowance: 100, plan: 'pro' } }, 'en')).toBe('AI credits: 40 left of 100 on pro.')
    expect(renderFact({ key: 'testPending', params: { title: { e: 'aTest' } }, dates: { date: '2026-10-01T00:00:00Z' } }, 'en')).toBe('Test "a test" submitted 2026-10-01; score not released yet (the organiser releases it).')
    expect(renderFact({ key: 'ticket', params: { subject: 'Login', status: { e: 'open' } }, dates: { opened: null, updated: 'x' } }, 'en')).toContain('opened unknown date, last update unknown date')
    const hi = renderFact(plan, 'hi')
    expect(hi).toMatch(SCRIPT.hi)
    expect(hi).not.toContain('2026-11-30')
    expect(renderFact(plan, 'te')).toMatch(SCRIPT.te)
    // Unknown enum words stay readable.
    expect(renderFact({ key: 'order', params: { number: 'A1', status: { e: 'on_the_way' }, payment: { e: 'paid' } }, dates: { placed: '2026-10-01' } }, 'en')).toBe('Order A1: on the way, payment paid, placed 2026-10-01.')
  })

  it('context loaders no longer build English sentences', () => {
    const src = read('lib/assistants/support/context.ts')
    expect(src).not.toMatch(/`Plan: |`AI credits: |`Test "|`Ticket "|`Order /)
    expect(read('lib/assistants/support/service.ts')).toContain('renderFact(f, body.locale)')
  })
})

describe('SEO-047: detail pages linked from the Hindi / Telugu hubs', () => {
  it('mentor, league, event, news and marketplace detail URLs are localized', async () => {
    const { localizedPath, canonicalLocalePath, hreflangAlternates } = await import('@/lib/i18n/public-paths')
    expect(localizedPath('/mentors/asha-rao', 'hi')).toBe('/hi/mentors/asha-rao')
    expect(localizedPath('/leagues/colleges/vnr', 'te')).toBe('/te/leagues/colleges/vnr')
    expect(localizedPath('/events/abc-123', 'hi')).toBe('/hi/events/abc-123')
    expect(localizedPath('/news/aws-update', 'te')).toBe('/te/news/aws-update')
    expect(localizedPath('/marketplace/p/book', 'hi')).toBe('/hi/marketplace/p/book')
    expect(localizedPath('/marketplace/s/codespectra', 'hi')).toBe('/hi/marketplace/s/codespectra')
    // Bodies written by people stay English: one canonical, no hreflang.
    for (const p of ['/mentors/asha-rao', '/events/abc-123', '/news/aws-update', '/marketplace/p/book']) {
      expect(canonicalLocalePath(p, 'hi')).toBe(p)
      expect(hreflangAlternates(p)).toBeNull()
    }
    expect(hreflangAlternates('/leagues/colleges/vnr')).toMatchObject({ hi: '/hi/leagues/colleges/vnr', te: '/te/leagues/colleges/vnr' })
  })

  it('every detail page has a /[lang] route and a shared view', () => {
    for (const [view, route] of [
      ['app/mentors/[slug]/mentor-view.tsx', 'app/[lang]/mentors/[slug]/page.tsx'],
      ['app/leagues/colleges/[slug]/college-view.tsx', 'app/[lang]/leagues/colleges/[slug]/page.tsx'],
      ['app/events/[id]/event-view.tsx', 'app/[lang]/events/[id]/page.tsx'],
      ['app/news/[slug]/news-post-view.tsx', 'app/[lang]/news/[slug]/page.tsx'],
      ['app/marketplace/p/[slug]/product-view.tsx', 'app/[lang]/marketplace/p/[slug]/page.tsx'],
      ['app/marketplace/s/[slug]/seller-view.tsx', 'app/[lang]/marketplace/s/[slug]/page.tsx'],
    ]) {
      expect(fs.existsSync(path.join(ROOT, route)), route).toBe(true)
      const src = read(view)
      expect(src, view).toContain('publicT(locale)')
      expect(src, view).not.toMatch(/>\s*(All mentors|All events|All leagues|Reviews|About this item|You may also like|Event FAQ)\s*</)
    }
  })

  it('hubs detail keys are complete in Hindi and Telugu', () => {
    const en = json('en', 'hubs')
    for (const l of ['hi', 'te'] as const) {
      const tr = json(l, 'hubs')
      for (const k of Object.keys(en).filter((x) => x.startsWith('dt'))) {
        expect(slots(tr[k] ?? ''), `${l}.${k}`).toEqual(slots(en[k]))
        if (/[a-z]{3}/.test(en[k].replace(/\{\w+\}/g, ''))) expect(SCRIPT[l].test(tr[k]), `${l}.${k}`).toBe(true)
      }
    }
  })

  it('mentor matches: localized hub link, language names, plural reviews', async () => {
    const src = read('components/study-plan/mentor-matches.tsx')
    expect(src).toContain("localizedPath('/mentors', locale)")
    expect(src).toContain('count: m.rating.count')
    const { languageName } = await import('@/lib/i18n/language-name')
    expect(languageName('hindi', 'en')).toBe('Hindi')
    expect(languageName('hindi', 'hi')).toMatch(SCRIPT.hi)
    expect(languageName('telugu', 'te')).toMatch(SCRIPT.te)
    expect(languageName('klingon', 'en')).toBe('Klingon')
    for (const l of ['en', 'hi', 'te']) {
      const d = json(l, 'dashboard')
      expect(d.mmRating_one && d.mmRating_other, l).toBeTruthy()
      expect(d.mmRating).toBeUndefined()
    }
  })
})

describe('SEO-039: the a11y e2e opens a test with every question type', () => {
  it('fixture: one question per type, all kept by the write-path sanitizer', async () => {
    const [{ a11yQuestionList, A11Y_EXAM_ID }, { QUESTION_TYPE_META }, { sanitizeExamQuestionList }] = await Promise.all([
      import('../scripts/fixtures/a11y-assessment'), import('@/lib/question-types'), import('@/lib/grading'),
    ])
    const list = sanitizeExamQuestionList(a11yQuestionList())
    expect(list.map((q) => q.type).sort()).toEqual(Object.keys(QUESTION_TYPE_META).sort())
    expect(new Set(list.map((q) => q.id)).size).toBe(list.length)
    expect(list.find((q) => q.type === 'case_study')?.sub_questions).toHaveLength(2)
    expect(list.find((q) => q.type === 'typing_test')?.typing).toBeTruthy()
    expect(list.find((q) => q.type === 'hotspot')?.regions).toHaveLength(2)
    expect(read('e2e/a11y-candidate.spec.ts')).toContain(`'${A11Y_EXAM_ID}'`)
  })

  it('CI seeds it and runs the admin pass', () => {
    const ci = fs.readFileSync(path.join(ROOT, '../.github/workflows/ci.yml'), 'utf8')
    expect(ci).toContain('scripts/seed-a11y-assessment.ts')
    expect(ci).toContain('e2e/a11y-admin.spec.ts')
    const admin = read('e2e/a11y-admin.spec.ts')
    for (const p of ['assistants', 'hiring-agents', 'onboarding']) expect(admin).toContain(`/dashboard/admin/${p}`)
  })
})

describe('SEO-042: Hindi / Telugu responses declare their language', () => {
  it('next.config sends Content-Language for /hi and /te', async () => {
    const cfg = (await import('../next.config.mjs')).default as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> }
    const rules = await cfg.headers()
    for (const lang of ['hi', 'te']) {
      for (const source of [`/${lang}`, `/${lang}/:path*`]) {
        expect(rules.find((r) => r.source === source)?.headers).toContainEqual({ key: 'Content-Language', value: lang })
      }
    }
  })
})

describe('SEO-044: copilot step labels translate', () => {
  it('stepLabel keeps English and accepts a translator', async () => {
    const { stepLabel, STEP_LABEL_EN } = await import('@/components/agent/transcript')
    expect(stepLabel('get_test', { test_id: 'abc' }, false)).toBe('Looked up test “abc”')
    expect(stepLabel('delegate_to_specialist', { specialist: 'hiring' }, true)).toBe('Asking the hiring specialist')
    const hi = json('hi', 'admin')
    const tr = { step: (k: string, p: Record<string, string>) => hi[`copilot.step.${k}`].replace(/\{(\w+)\}/g, (_m, x: string) => p[x] ?? ''), agent: (id: string, fb: string) => hi[`copilot.specialist.${id}`] ?? fb }
    expect(stepLabel('search_knowledge', { query: 'java' }, false, tr)).toMatch(SCRIPT.hi)
    expect(stepLabel('delegate_to_specialist', { specialist: 'hiring' }, false, tr)).toContain(hi['copilot.specialist.hiring'])
    for (const k of Object.keys(STEP_LABEL_EN)) expect(hi[`copilot.step.${k}`], k).toBeDefined()
  })
})

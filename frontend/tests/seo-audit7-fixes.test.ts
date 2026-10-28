/**
 * Audit-7 SEO / i18n / a11y fixes (SEO-053 … SEO-063). The JSX scans live in
 * tests/i18n-app-areas.test.ts + tests/i18n-admin-jsx.test.ts (SEO-053/057/058
 * widened them) and the uncoded API error ratchet in tests/i18n-api-errors.test.ts (SEO-055).
 */
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('@/lib/session', () => ({ deriveServerKey: async () => new Uint8Array(32).fill(7), loadAuthProfile: async () => null }))

const ROOT = path.resolve(__dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const json = (l: string, ns: string) => JSON.parse(read(`lib/i18n/messages/${l}/${ns}.json`)) as Record<string, string>
const SCRIPT = { hi: /[ऀ-ॿ]/, te: /[ఀ-౿]/ } as const

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel)
  }
  return out
}

describe('SEO-059: feed event ids keep the page language', () => {
  it('ef_ ids are localized detail paths', async () => {
    const { localizedPath, switchLocaleHref, isLocalizedPath } = await import('@/lib/i18n/public-paths')
    expect(isLocalizedPath('/events/ef_0123456789abcdef')).toBe(true)
    expect(localizedPath('/events/ef_0123456789abcdef', 'hi')).toBe('/hi/events/ef_0123456789abcdef')
    expect(switchLocaleHref('/hi/events/ef_0123456789abcdef', 'te')).toBe('/te/events/ef_0123456789abcdef')
    // Still no nested paths or odd characters.
    expect(isLocalizedPath('/events/ef_1/edit')).toBe(false)
    expect(isLocalizedPath('/events/EF_1')).toBe(false)
  })
})

describe('SEO-063: AI-search facts describe hiring, learner and integration features', () => {
  it('capabilities mention the ATS, hiring agents, campus portal and integrations', async () => {
    const { PRODUCT_FACTS } = await import('@/lib/seo/llms')
    const facts = PRODUCT_FACTS.capabilities.join(' ').toLowerCase()
    for (const w of ['applicant tracking', 'hiring pipeline', 'background verification', 'sourcer', 'interview scheduler', 'assessment author', 'integrity reviewer', 'campus placement', 'skill passport', 'resume builder', 'job matching', 'whatsapp', 'guardians', 'cohort', 'google classroom', 'moodle', 'slack', 'microsoft teams']) {
      expect(facts, w).toContain(w)
    }
  })
})

describe('SEO-056: destructive colour tokens meet 4.5:1', () => {
  const css = read('app/globals.css')
  const block = (selector: string) => {
    const i = css.indexOf(`${selector} {`)
    return css.slice(i, css.indexOf('\n}', i))
  }
  const token = (b: string, name: string) => {
    const m = new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`).exec(b)
    if (!m) throw new Error(`no --${name}`)
    return [Number(m[1]), Number(m[2]), Number(m[3])] as const
  }
  const rgb = ([h, s, l]: readonly [number, number, number]) => {
    const S = s / 100, L = l / 100
    const k = (n: number) => (n + h / 30) % 12
    const a = S * Math.min(L, 1 - L)
    return [0, 8, 4].map((n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))
  }
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: readonly [number, number, number], b: readonly [number, number, number]) => {
    const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  for (const sel of [':root', '.dark']) {
    it(`${sel}: red text on page / card / muted, and button text on red`, () => {
      const b = block(sel)
      const red = token(b, 'destructive')
      for (const bg of ['background', 'card', 'muted']) expect(ratio(red, token(b, bg)), `${sel} destructive on ${bg}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(red, token(b, 'destructive-foreground')), `${sel} destructive-foreground`).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('shared red buttons / badges use the paired foreground, not white', () => {
    for (const f of ['components/ui/button.tsx', 'components/ui/badge.tsx']) expect(read(f)).not.toMatch(/bg-destructive text-white/)
  })

  it('CI fails on serious colour-contrast findings (crawl + signed-in a11y specs)', () => {
    expect(read('../.github/workflows/ci.yml')).toMatch(/--axe-gate critical,color-contrast/)
    expect(read('scripts/qa/crawl.mjs')).toMatch(/AXE_GATE_RULES\.has\(v\.id\)/)
    for (const f of ['e2e/a11y-candidate.spec.ts', 'e2e/a11y-admin.spec.ts']) expect(read(f)).toMatch(/v\.impact === 'critical' \|\| v\.id === 'color-contrast'/)
  })
})

describe('SEO-062: Enter never sends while an IME is composing', () => {
  it('isSubmitEnter: composing (isComposing or keyCode 229), Shift and modifier rules', async () => {
    const { isSubmitEnter, isImeComposing } = await import('@/lib/keyboard')
    expect(isSubmitEnter({ key: 'Enter' })).toBe(true)
    expect(isSubmitEnter({ key: 'a' })).toBe(false)
    expect(isSubmitEnter({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(false)
    expect(isSubmitEnter({ key: 'Enter', isComposing: true })).toBe(false)
    expect(isSubmitEnter({ key: 'Enter', keyCode: 229 })).toBe(false)
    expect(isImeComposing({ key: 'Enter', nativeEvent: { keyCode: 229 } })).toBe(true)
    expect(isSubmitEnter({ key: 'Enter', shiftKey: true }, { shift: false })).toBe(false)
    expect(isSubmitEnter({ key: 'Enter', shiftKey: true })).toBe(true)
    expect(isSubmitEnter({ key: 'Enter' }, { modifier: true })).toBe(false)
    expect(isSubmitEnter({ key: 'Enter', ctrlKey: true }, { modifier: true })).toBe(true)
  })

  it('every text-input Enter handler is IME-safe (button-style Enter/Space activation excluded)', () => {
    // Global Ctrl/Cmd+Enter shortcut on the problem page (not a text input confirm).
    const ALLOW = new Set(['app/dashboard/problems/[slug]/page.tsx'])
    const bad: string[] = []
    for (const f of [...walk('app'), ...walk('components')].filter((x) => x.endsWith('.tsx'))) {
      if (ALLOW.has(f)) continue
      for (const m of read(f).matchAll(/[^\n]*\.key === 'Enter'[^\n]*/g)) {
        const line = m[0]
        if (/key === ' '/.test(line) || /isComposing|isSubmitEnter/.test(line)) continue
        bad.push(`${f}: ${line.trim().slice(0, 120)}`)
      }
    }
    expect(bad).toEqual([])
  })
})

describe('SEO-061: tour controls in the user language', () => {
  it('labels feed the driver config (English default) and the hint button', async () => {
    const { ENGLISH_TOUR_LABELS, getTourLabels, setTourLabels, tourLabelConfig } = await import('@/lib/tour-driver')
    expect(tourLabelConfig(ENGLISH_TOUR_LABELS)).toEqual({ nextBtnText: 'Next', prevBtnText: 'Back', doneBtnText: 'Finish', progressText: '{{current}} of {{total}}' })
    setTourLabels({ next: 'आगे', progress: '{{total}} में से {{current}}' })
    expect(getTourLabels()).toMatchObject({ next: 'आगे', back: 'Back', progress: '{{total}} में से {{current}}' })
    setTourLabels(null)
    expect(getTourLabels()).toEqual(ENGLISH_TOUR_LABELS)
  })

  it('the provider passes catalog labels; the welcome tour uses dash keys in every language', async () => {
    expect(read('components/tour/tour-context.tsx')).toMatch(/setTourLabels\(\{/)
    const { welcomeTourSteps, WELCOME_TOUR_STEPS } = await import('@/lib/tour-driver')
    const steps = welcomeTourSteps((k) => `#${k}`)
    expect(steps.map((s) => s.target)).toEqual(WELCOME_TOUR_STEPS.map((s) => s.target))
    expect(steps.every((s) => s.title.startsWith('#dash.') && s.description.startsWith('#dash.'))).toBe(true)
    for (const l of ['hi', 'te'] as const) {
      for (const k of ['tourFinish', 'tourProgress', 'tourGotIt']) expect(json(l, 'common')[k], `${l}.common.${k}`).toMatch(SCRIPT[l])
      for (const k of ['tourWelcomeHomeTitle', 'tourWelcomeArenaBody', 'tourWelcomeScannerBody']) expect(json(l, 'dash')[k], `${l}.dash.${k}`).toMatch(SCRIPT[l])
      expect(json(l, 'admin')['system.tourHeaderTitle']).toMatch(SCRIPT[l])
    }
    expect(read('app/dashboard/admin/system/page.tsx')).not.toMatch(/title: 'Platform operations overview'/)
  })
})

describe('SEO-053: cookie banner in the page language', () => {
  it('uses common.consent* keys (translated) and no inline English', () => {
    const src = read('components/analytics/consent-banner.tsx')
    expect(src).toMatch(/useT\(\)/)
    expect(src).not.toMatch(/Your privacy choices|Essential only|Accept all|Save choices/)
    for (const l of ['hi', 'te'] as const) {
      for (const k of ['consentTitle', 'consentBody', 'consentEssentialOnly', 'consentAcceptAll', 'consentSave', 'consentCloseAria']) expect(json(l, 'common')[k], `${l}.${k}`).toMatch(SCRIPT[l])
    }
  })
})

describe('SEO-060: mock-up screens, mentor booking box and the root error page', () => {
  it('every showcase string has Hindi and Telugu copy in landing.json', () => {
    const en = new Set<string>()
    for (const f of ['components/visuals/screens.tsx', 'components/visuals/device-showcase.tsx']) for (const m of read(f).matchAll(/tr\('([^']+)'\)/g)) en.add(m[1])
    expect(en.size).toBeGreaterThan(40)
    for (const l of ['hi', 'te'] as const) {
      const t = json(l, 'landing')
      const missing = [...en].filter((s) => !t[`showcase:${s}`] || !SCRIPT[l].test(t[`showcase:${s}`]))
      expect(missing, l).toEqual([])
    }
    for (const f of ['app/landing-view.tsx', 'app/features/features-view.tsx', 'app/companies/companies-view.tsx']) {
      expect(read(f).match(/<DeviceShowcase (?!tr=)/g), f).toBeNull()
    }
  })

  it('the mentor booking box gets its copy from hubs.json; global-error has hi / te text', () => {
    expect(read('app/mentors/[slug]/mentor-view.tsx')).toMatch(/labels=\{\{[\s\S]*hubs\.bookerSessionType/)
    for (const l of ['hi', 'te'] as const) expect(json(l, 'hubs').bookerNote).toMatch(SCRIPT[l])
    const ge = read('app/global-error.tsx')
    expect(ge).toMatch(/hi: \{ title: 'कुछ गड़बड़/)
    expect(ge).toMatch(/te: \{ title: 'ఏదో పొరపాటు/)
  })
})

describe('SEO-058: email preferences page and subscriber links in the subscriber language', () => {
  it('manage links carry the subscriber language; English links stay as they were', async () => {
    const { manageUrl } = await import('@/lib/subscriptions/channels')
    expect(await manageUrl({ id: 's1', token_nonce: 'n', locale: 'te' }, { action: 'unsubscribe' })).toMatch(/[?&]lang=te(&|$)/)
    expect(await manageUrl({ id: 's1', token_nonce: 'n' })).not.toMatch(/lang=/)
  })

  it('the email shell footer is localized', async () => {
    const { renderEmailShell } = await import('@/lib/subscriptions/channels')
    const hi = renderEmailShell({ heading: 'h', bodyHtml: '<p>b</p>', manageUrl: 'https://x/m', unsubscribeUrl: 'https://x/u', reason: 'r', locale: 'hi' })
    expect(hi).toContain('lang="hi"')
    expect(hi).toContain(json('hi', 'email')['sub.shell.unsubscribe'])
    expect(renderEmailShell({ heading: 'h', bodyHtml: '', manageUrl: 'm', unsubscribeUrl: 'u', reason: 'r' })).toContain('>Manage preferences</a>')
  })

  it('both subscription pages pick the language from ?lang= and the components use public.json', () => {
    for (const f of ['app/subscriptions/manage/page.tsx', 'app/subscriptions/confirm/page.tsx']) expect(read(f)).toMatch(/<LocaleRoot locale=\{toLocale\(/)
    for (const l of ['hi', 'te'] as const) for (const k of ['subsUnsubscribeAll', 'subsWhatsappConsent', 'subsSave', 'subsConfirmButton']) expect(json(l, 'public')[k]).toMatch(SCRIPT[l])
  })
})

describe('SEO-054: reminders and digests render in the recipient language', () => {
  it('event reminder durations become plural catalog text', async () => {
    const { hoursLeftParts, hoursLeftLabel } = await import('@/lib/automation/system/rules')
    const now = new Date('2026-11-01T10:00:00Z')
    expect(hoursLeftParts('2026-11-02T10:00:00Z', now)).toEqual({ unit: 'hours', count: 24 })
    expect(hoursLeftParts('2026-11-01T10:45:00Z', now)).toEqual({ unit: 'minutes', count: 45 })
    expect(hoursLeftLabel('2026-11-01T10:45:00Z', now)).toBe('45 minutes')
    const { renderOutbound } = await import('@/lib/i18n/outbound')
    const left = { t: 'auto.left.hours', params: { count: 24 } }
    expect(renderOutbound('email', 'en', { key: 'auto.event.startsSubject', params: { name: 'Hackwave', left } })).toBe('Hackwave starts in 24 hours')
    const hi = renderOutbound('email', 'hi', { key: 'auto.event.startsSubject', params: { name: 'Hackwave', left } })
    expect(hi).toMatch(SCRIPT.hi)
    expect(hi).toContain('24')
    expect(renderOutbound('notify', 'te', { key: 'event.starts.title', params: { name: 'H', left: { t: 'time.left.minutes', params: { count: 5 } } } })).toMatch(SCRIPT.te)
  })

  it('localizeMail renders a candidate reminder and an interview reminder', async () => {
    const { localizeMail } = await import('@/lib/automation/mailer')
    const mail = {
      subject: 'Reminder: your assessment for DSA', heading: 'Your assessment is still open', bodyText: 'x', reason: 'r',
      i18n: { subject: { key: 'auto.hiring.assessSubject', params: { title: 'DSA' } }, heading: { key: 'auto.hiring.assessHeading' }, body: [{ key: 'auto.hiNoName' }, { key: 'auto.hiring.assessBody', params: { title: 'DSA' } }], reason: { key: 'auto.hiring.reason', params: { title: 'DSA' } } },
    }
    const te = localizeMail(mail, 'te')
    expect(te.subject).toMatch(SCRIPT.te)
    expect(te.bodyText).toContain('DSA')
    expect(localizeMail(mail, 'en').subject).toBe('Reminder: your assessment for DSA')
    const iv = localizeMail({ subject: 's', heading: 'h', bodyText: 'b', i18n: { subject: { key: 'auto.interview.subject', params: { left: { t: 'auto.left.minutes', params: { count: 60 } } } }, heading: { key: 'auto.interview.heading', params: { left: { t: 'auto.left.minutes', params: { count: 60 } } } }, body: { key: 'auto.interview.details', params: { title: { t: 'auto.interview.fallbackTitle' }, when: 'w', minutes: 45 } } } }, 'hi')
    expect(iv.bodyText).toMatch(SCRIPT.hi)
    expect(iv.bodyText).toContain('45')
  })

  it('no sendAutomationEmail({ … }) without an i18n block outside the allow-list', () => {
    // Workflows send organisation-written text; ops alerts go to platform staff; nudges spread a message that carries i18n;
    // cohort invites translate at the call site (t()).
    const ALLOW = new Set(['lib/automation/actions.ts', 'lib/automation/alerts.ts', 'lib/automation/nudges/deliver.ts', 'lib/cohorts/service.ts'])
    const bad: string[] = []
    for (const f of [...walk('lib'), ...walk('app')]) {
      if (ALLOW.has(f)) continue
      const s = read(f)
      for (const m of s.matchAll(/sendAutomationEmail\(\{/g)) {
        let depth = 0
        let j = (m.index ?? 0) + m[0].length - 1
        for (; j < s.length; j++) {
          if (s[j] === '{') depth++
          else if (s[j] === '}' && --depth === 0) break
        }
        if (!/\bi18n\b/.test(s.slice(m.index, j))) bad.push(`${f}:${s.slice(0, m.index).split('\n').length}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('daily digest and subscriber confirmation use the email catalog', () => {
    expect(read('app/api/cron/daily-digest/route.ts')).toMatch(/et\('digest\.daily\.subject'/)
    const svc = read('lib/subscriptions/service.ts')
    expect(svc).toMatch(/et\('sub\.confirm\.subject'\)/)
    expect(svc).not.toMatch(/subject: 'Confirm your CodeSpectra updates'/)
    for (const l of ['hi', 'te'] as const) for (const k of ['digest.daily.subject', 'sub.confirm.body', 'auto.event.closesBody', 'auto.hiring.offerBody', 'auto.interview.candidateTip']) expect(json(l, 'email')[k]).toMatch(SCRIPT[l])
  })
})

describe('SEO-055: payment verification errors are readable and coded', () => {
  it('billing verify sends catalog codes, not bare machine strings', () => {
    const src = read('app/api/billing/verify/route.ts')
    expect(src).not.toMatch(/error: '(signature_mismatch|plan_mismatch|order_refunded|payment_mismatch|order_not_found)'/)
    expect(src).toMatch(/apiErrorFor\('signature_mismatch'\)/)
  })

  it('a Hindi toast shows a known English API error in Hindi (catalog lookup)', async () => {
    const { localizeApiError } = await import('@/lib/i18n/api-error')
    const tables = { apiErrors: json('hi', 'apiErrors'), apiErrorsEn: json('en', 'apiErrors') }
    expect(localizeApiError('hi', tables, { error: 'Invite has expired' }, 'f')).toMatch(SCRIPT.hi)
    expect(localizeApiError('hi', tables, { error: 'Team is full (4 max)', code: 'hk_team_full_max', params: { max: 4 } }, 'f')).toMatch(SCRIPT.hi)
  })
})

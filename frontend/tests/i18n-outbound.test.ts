/**
 * Messages we send, in the recipient's language: email templates per locale,
 * notification text + locale selection, WhatsApp template language.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { emailTemplates, emailTemplatesFor, hackathonEmailTemplatesFor, emailLongDate } from '@/lib/email-templates'
import { OUTBOUND_CATALOGS, hasOutboundKey, outboundT, renderOutbound } from '@/lib/i18n/outbound'
import { isMissingTranslationError, parseApprovedLocales, whatsappTemplateLanguage } from '@/lib/i18n/whatsapp-language'

const SCRIPT = { hi: /[ऀ-ॿ]/, te: /[ఀ-౿]/ } as const
const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const ROOT = path.resolve(__dirname, '..')

vi.mock('@/lib/session', () => ({
  loadAuthProfile: vi.fn(async (uid: string) => (uid === 'u-hi' ? { ui_locale: 'hi' } : uid === 'u-te' ? { ui_locale: 'te' } : uid === 'u-bad' ? { ui_locale: 'fr' } : null)),
}))

describe('outbound catalogs', () => {
  for (const ns of ['email', 'notify'] as const) {
    const en = OUTBOUND_CATALOGS[ns].en
    for (const l of ['hi', 'te'] as const) {
      it(`${ns}/${l}: every key, same placeholders, real ${l} script`, () => {
        const tr = OUTBOUND_CATALOGS[ns][l]
        expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort())
        for (const [k, v] of Object.entries(en)) {
          expect(slots(tr[k]), `${ns}.${k}`).toEqual(slots(v))
          if (/[A-Za-z]{3}/.test(v.replace(/\{\w+\}|CodeSpectra|XP|2FA|PhonePe/g, '')) && !/^[{}\w\s—-]+$/.test(v)) {
            expect(SCRIPT[l].test(tr[k]), `${ns}.${l}.${k}: "${tr[k]}"`).toBe(true)
          }
        }
      })
    }
  }

  it('plural keys come in one/other pairs', () => {
    for (const ns of ['email', 'notify'] as const) {
      for (const k of Object.keys(OUTBOUND_CATALOGS[ns].en)) if (k.endsWith('_one')) expect(OUTBOUND_CATALOGS[ns].en[`${k.slice(0, -4)}_other`]).toBeDefined()
    }
  })
})

describe('email templates per locale', () => {
  const calls: [string, unknown[]][] = [
    ['welcomeEmail', ['Asha']], ['loginNotification', ['Asha', 'Chrome', 'Hyderabad', '10:00']], ['jobApplicationConfirmation', ['Dev', 'Acme', 'Asha']],
    ['examStartedNotification', ['DSA', 'Asha']], ['subscriptionConfirmation', ['Pro', 99900, 'INR']], ['invoiceNotification', ['I1', 99900, 'Pro', 'INR']],
    ['phonePePaymentSuccess', ['Pro', 99900, 'tx1']], ['phonePePaymentFailed', ['Pro', 99900, 'Declined']], ['passwordReset', ['https://x/r']],
    ['emailVerification', ['https://x/v']], ['teamInvite', ['Alpha', 'Ravi', 'https://x/a']], ['orgInvite', [{ orgName: 'VNR', invitedByName: 'Ravi', acceptUrl: 'https://x' }]],
    ['atsTeamInvite', [{ orgName: 'Acme', invitedByName: 'Ravi', roleLabel: 'Recruiter', clientName: 'Beta', acceptUrl: 'https://x', expiresDays: 7 }]],
    ['twoFactorBackup', ['AAAA-BBBB']], ['assessmentInvite', [{ candidateName: 'Asha', examTitle: 'DSA', inviteUrl: 'https://x', expiresIn: '1 Nov' }]],
    ['assessmentScoreReleased', [{ candidateName: 'Asha', examTitle: 'DSA', score: 7, maxScore: 10, resultsUrl: 'https://x' }]],
    ['assessmentReminder', [{ candidateName: 'Asha', examTitle: 'DSA', inviteUrl: 'https://x', expiresIn: '1 Nov' }]],
    ['levelUp', [{ name: 'Asha', newLevel: 3, totalXp: 500, certUrl: '/c' }]], ['certificateEarned', [{ name: 'Asha', title: 'DSA', certUrl: '/c' }]],
    ['newsletter', [{ subject: 'S', body: '<p>B</p>' }]], ['orgAccountProvisioned', [{ name: 'A', email: 'a@x.in', password: 'p', orgName: 'O', role: 'r' }]],
    ['accountCredentials', [{ name: 'A', email: 'a@x.in', role: 'r', orgName: 'O' }]],
  ]
  const hack: [string, unknown][] = [
    ['teamInvite', { eventName: 'E', teamName: 'T', invitedByName: 'B', inviteUrl: 'u', expiresIn: '7 days' }],
    ['eventStarting', { eventName: 'E', teamName: 'T', startsAt: '2h', duration: '24h', workspaceUrl: 'u' }],
    ['endingSoon', { eventName: 'E', teamName: 'T', endsAt: '1h', xp: 5, problemsSolved: 2, workspaceUrl: 'u' }],
    ['judgeAssignment', { eventName: 'E', judgeName: 'J', teamCount: 4, problemCount: 2, reviewUrl: 'u' }],
    ['teamJoinConfirmation', { eventName: 'E', teamName: 'T', memberName: 'M', workspaceUrl: 'u' }],
    ['resultsReleased', { eventName: 'E', teamName: 'T', rank: 2, totalTeams: 9, score: 80, resultsUrl: 'u' }],
    ['detailedResults', { eventName: 'E', teamName: 'T', rank: 5, totalTeams: 9, totalXp: 80, problems: [{ title: 'P', points: 10, earned: 5, submittedAt: 's', timeSpent: '5m', attempts: 2 }], resultsUrl: 'u', certificateUrl: 'c' }],
  ]
  const leftoverKey = /\b(?:label|value|welcome|login|job|examStarted|subscription|invoice|paySuccess|payFailed|reset|verify|teamInvite|orgInvite|atsInvite|backup|assessInvite|assessResults|assessReminder|assess|levelUp|cert|newsletter|account|hack|notify|button|invite|footer|duration)\.[a-zA-Z.]+\b/

  for (const l of ['hi', 'te'] as const) {
    it(`renders every template in ${l} (subject + body), no raw keys`, () => {
      const set = emailTemplatesFor(l) as unknown as Record<string, (...a: unknown[]) => { subject: string; html: string }>
      for (const [name, args] of calls) {
        const out = set[name](...args)
        if (name !== 'newsletter') expect(SCRIPT[l].test(out.subject), `${l} ${name} subject: ${out.subject}`).toBe(true)
        expect(SCRIPT[l].test(out.html), `${l} ${name} body`).toBe(true)
        expect(out.html, `${l} ${name}`).not.toMatch(leftoverKey)
        expect(out.html).toContain(`lang="${l}"`)
      }
      const h = hackathonEmailTemplatesFor(l) as unknown as Record<string, (a: unknown) => { subject: string; html: string }>
      for (const [name, a] of hack) {
        const out = h[name](a)
        expect(SCRIPT[l].test(out.subject), `${l} hack ${name}`).toBe(true)
        expect(out.html).not.toMatch(leftoverKey)
      }
    })
  }

  it('English keeps the previous wording', () => {
    expect(emailTemplates.passwordReset('u').subject).toBe('Reset your CodeSpectra password')
    expect(emailTemplatesFor('en').welcomeEmail('Asha').subject).toBe('Welcome to CodeSpectra, Asha!')
    expect(emailTemplatesFor('en').assessmentInvite({ candidateName: 'A', examTitle: 'DSA', inviteUrl: 'u', expiresIn: 'x' }).subject).toBe('You\'re invited to complete "DSA" — CodeSpectra Assessment')
    expect(emailTemplatesFor('en').loginNotification('Asha', 'd', 'l', 't').html).toContain('Hi <strong>Asha</strong>, we noticed a new sign-in to your account.')
    expect(emailTemplatesFor('xx').passwordReset('u').subject).toBe('Reset your CodeSpectra password')
  })

  it('markup in translations becomes HTML and values are inserted once', () => {
    const html = emailTemplatesFor('hi').loginNotification('**Asha**', 'd', 'l', 't').html
    expect(html).toContain('<strong>**Asha**</strong>')
    expect(html).toMatch(/<a href="[^"]+\/dashboard\/settings" style="[^"]+">[^<]+<\/a>/)
  })

  it('dates follow the recipient language', () => {
    expect(emailLongDate('2026-11-01T10:00:00Z', 'en')).toMatch(/November/)
    expect(emailLongDate('2026-11-01T10:00:00Z', 'hi')).toMatch(SCRIPT.hi)
    expect(emailLongDate('2026-11-01T10:00:00Z', 'te')).toMatch(SCRIPT.te)
  })
})

describe('notification text and locale', () => {
  beforeEach(() => vi.resetModules())

  it('picks the recipient profile language, English when unset or unknown', async () => {
    const { localeForUser, recipientLocaleFrom } = await import('@/lib/i18n/recipient')
    expect(await localeForUser('u-hi')).toBe('hi')
    expect(await localeForUser('u-te')).toBe('te')
    expect(await localeForUser('u-none')).toBe('en')
    expect(await localeForUser('u-bad')).toBe('en')
    expect(await localeForUser('candidate_123')).toBe('en')
    expect(await localeForUser(null)).toBe('en')
    expect(recipientLocaleFrom({ ui_locale: 'te-IN' })).toBe('te')
  })

  it('renders keys in the recipient language and keeps English callers unchanged', async () => {
    const { notificationText } = await import('@/lib/notifications')
    const input = {
      type: 'xp.awarded',
      title: 'You gained 50 XP!',
      message: 'Keep up the great work — 50 XP added to your profile.',
      title_i18n: { key: 'xp.gained.title', params: { amount: 50 } },
      message_i18n: { key: 'xp.gained.message', params: { amount: 50 } },
    }
    expect(notificationText(input, 'en')).toEqual({ title: input.title, message: input.message })
    const hi = notificationText(input, 'hi')
    expect(hi.title).toMatch(SCRIPT.hi)
    expect(hi.title).toContain('50')
    expect(notificationText(input, 'te').message).toMatch(SCRIPT.te)
  })

  it('translates the type default title and joins message parts', async () => {
    const { notificationText } = await import('@/lib/notifications')
    expect(notificationText({ type: 'billing.payment_failed' }, 'en').title).toBe('Payment Failed')
    expect(notificationText({ type: 'billing.payment_failed' }, 'te').title).toMatch(SCRIPT.te)
    expect(notificationText({ type: 'unknown.type' }, 'hi').title).toMatch(SCRIPT.hi)
    const parts = notificationText({ type: 'hackathon.results', message_i18n: [{ key: 'results.rankedYou', params: { rank: 2, total: 9 } }, { key: 'results.certReady' }] }, 'en')
    expect(parts.message).toBe('You ranked #2 of 9. Your certificate is ready to view and share.')
    // Unknown key → the caller's text, never the key.
    expect(notificationText({ type: 'x', title: 'Fallback', title_i18n: { key: 'nope.key' } }, 'hi').title).toBe('Fallback')
  })

  it('plural and nested (enum) values', () => {
    expect(renderOutbound('notify', 'en', { key: 'studyPlan.message', params: { count: 1, mins: 20, items: 'Arrays' } })).toBe('1 item left today (about 20 min): Arrays')
    expect(renderOutbound('notify', 'en', { key: 'studyPlan.message', params: { count: 3, mins: 20, items: 'A' } })).toMatch(/^3 items/)
    expect(renderOutbound('notify', 'hi', { key: 'talent.invite.message', params: { target: { t: 'talent.target.job' }, title: 'SDE' } })).toContain(outboundT('notify', 'hi')('talent.target.job'))
  })

  it('every key used by notify() call sites exists', () => {
    const files = ['app/api', 'lib'].flatMap((d) => listFiles(path.join(ROOT, d)))
    const missing: string[] = []
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8')
      if (!/title_i18n|message_i18n/.test(s)) continue
      for (const m of s.matchAll(/(?:title_i18n|message_i18n)[^\n]*/g)) {
        for (const k of m[0].matchAll(/key: '([\w.]+)'/g)) if (!hasOutboundKey('notify', k[1])) missing.push(`${path.relative(ROOT, f)}: ${k[1]}`)
      }
    }
    // Keys built at runtime (template literals in lib/codeathon-release, contests, fulfilment, submissions).
    for (const k of ['results.rankedTeam', 'results.rankedTeamTied', 'results.rankedYou', 'results.rankedYouTied', 'results.rankedTeamPoints', 'results.rankedTeamTiedPoints', 'results.rankedYouPoints', 'results.rankedYouTiedPoints',
      'mkt.line.processing', 'mkt.line.shipped', 'mkt.line.delivered', 'mkt.line.completed', 'mkt.line.cancelled',
      'submission.under_review', 'submission.review_completed', 'submission.accepted', 'submission.released',
      'talent.target.job', 'talent.target.test', 'talent.target.interview']) {
      if (!hasOutboundKey('notify', k)) missing.push(k)
    }
    expect(missing).toEqual([])
  })
})

describe('WhatsApp template language', () => {
  it('uses the recipient language only when approved, with the base as fallback', () => {
    expect(whatsappTemplateLanguage('hi', { base: 'en_US', approved: ['hi', 'te'] })).toEqual({ language: 'hi', fallback: 'en_US' })
    expect(whatsappTemplateLanguage('te', { base: 'en', approved: 'hi' })).toEqual({ language: 'en', fallback: null })
    expect(whatsappTemplateLanguage('en', { base: 'en', approved: ['hi'] })).toEqual({ language: 'en', fallback: null })
    expect(whatsappTemplateLanguage(null, { base: 'bad value', approved: [] })).toEqual({ language: 'en', fallback: null })
  })

  it('parses the approved list and spots Meta "missing translation" errors', () => {
    expect(parseApprovedLocales('hi, te,fr,en')).toEqual(['hi', 'te'])
    expect(parseApprovedLocales(['te-IN'])).toEqual(['te'])
    expect(isMissingTranslationError('Meta 404 (132001): Template name does not exist in the translation')).toBe(true)
    expect(isMissingTranslationError('Meta 400 (131026): Message undeliverable')).toBe(false)
  })
})

function listFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) listFiles(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

// SEO-033: account / security / invite notices go out in the recipient's language.
describe('notice emails', () => {
  const NOTICES: [string, Record<string, string | number>, { code?: string; buttonUrl?: string }][] = [
    ['faceCode', {}, { code: '123456' }],
    ['signinSecured', { via: 'Google', url: 'https://x/f' }, {}],
    ['emailChange', {}, { code: '123456' }],
    ['emailChanged', { email: 'a@x.in', url: 'https://x/u' }, {}],
    ['phoneVerify', { phone: '+91 98765' }, { code: '123456' }],
    ['interviewScheduled', { title: 'SDE', role: 'Backend', type: 'technical', when: '1 Nov', minutes: 45 }, { buttonUrl: 'https://x/live' }],
    ['campusInvite', { college: 'VNR', name: 'Asha', days: 14 }, { buttonUrl: 'https://x/j' }],
    ['newsletterConfirm', {}, { buttonUrl: 'https://x/c' }],
    ['kycReminder', { name: 'Asha' }, {}],
    ['kycReverify', { name: 'Asha' }, {}],
  ]
  for (const l of ['hi', 'te'] as const) {
    it(`renders every notice in ${l} with values, button and code`, () => {
      for (const [key, params, extra] of NOTICES) {
        const out = emailTemplatesFor(l).notice({ key, params, ...extra })
        expect(SCRIPT[l].test(out.subject), `${l} ${key} subject`).toBe(true)
        expect(SCRIPT[l].test(out.html), `${l} ${key} body`).toBe(true)
        expect(out.html).toContain(`lang="${l}"`)
        expect(out.html).not.toMatch(/\{\w+\}/)
        if (extra.code) expect(out.html).toContain(extra.code)
        if (extra.buttonUrl) expect(out.html).toContain(`href="${extra.buttonUrl}"`)
      }
    })
  }

  it('English keeps the old wording and the ATS defaults match the catalog', async () => {
    expect(emailTemplatesFor('en').notice({ key: 'faceCode', code: '1' }).subject).toBe('Your CodeSpectra sign-in code')
    expect(emailTemplatesFor('en').notice({ key: 'campusInvite', params: { college: 'VNR', name: 'A', days: 7 } }).subject).toBe('Join VNR on CodeSpectra')
    const { DEFAULT_OFFER, DEFAULT_REJECTION } = await import('@/lib/ats/notify')
    expect(OUTBOUND_CATALOGS.email.en['atsDefault.rejection.body']).toBe(DEFAULT_REJECTION.body)
    expect(OUTBOUND_CATALOGS.email.en['atsDefault.offer.subject']).toBe(DEFAULT_OFFER.subject)
  })

  it('no new sendEmail call with a hard-coded English subject', () => {
    // Ratchet: these still build English text inline; new senders must use email.json + emailTemplatesFor(recipient locale).
    const ALLOWED = new Set(['lib/db/certifications.ts'])
    const found = new Set<string>()
    for (const f of ['app', 'lib'].flatMap((d) => listFiles(path.join(ROOT, d)))) {
      const s = fs.readFileSync(f, 'utf8')
      if (!s.includes('sendEmail(')) continue
      for (const m of s.matchAll(/sendEmail\(/g)) if (/subject:\s*['`"][A-Z][a-z]/.test(s.slice(m.index, m.index + 500))) found.add(path.relative(ROOT, f))
    }
    expect([...found].filter((f) => !ALLOWED.has(f))).toEqual([])
  })
})

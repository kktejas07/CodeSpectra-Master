/**
 * Admin console catalog (lib/i18n/admin.tsx): complete in hi / te, same
 * placeholders, real script except for product / API names, and every key
 * the admin pages use exists.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import en from '@/lib/i18n/messages/en/admin.json'
import hi from '@/lib/i18n/messages/hi/admin.json'
import te from '@/lib/i18n/messages/te/admin.json'
import { adminTranslate } from '@/lib/i18n/admin'

const EN = en as Record<string, string>
const ROOT = path.resolve(__dirname, '..')
const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const SCRIPT = { hi: /[ऀ-ॿ]/, te: /[ఀ-౿]/ } as const

/** Names of products, APIs and settings that admins read in English in every language. */
const INTENTIONALLY_ENGLISH = new Set([
  'qbank.codingMcq', 'qbank.branch', 'qbank.advancedFieldsJson', 'qbank.pairsMatrixTableHotspotScale', 'patterns.sections', 'patterns.cutOff',
  'contests.format', 'contest.judging', 'contest.leaderboard', 'feed.format', 'feed.timeZone', 'assess.assessments', 'settings.privacyPolicyUrl',
  'settings.termsOfServiceUrl', 'settings.brandingOverlay', 'settings.postalServerUrl', 'settings.postalApiKey', 'settings.webhookSigningKeyPublic',
  'settings.maintenanceMode', 'settings.askCodespectraChatbot', 'settings.integrations', 'settings.dynamic', 'settings.codeExecutionBackendPiston',
  'settings.inProcess', 'settings.githubAppPatToken', 'settings.internalBackendAuthSecret', 'settings.routes', 'settings.environmentVariable',
  'settings.clientId', 'settings.clientSecret', 'settings.firebaseAuthSdk', 'settings.firebaseConsoleProjectSettingsGeneral',
  'settings.razorpayDashboardSettingsApiKeys', 'settings.keyId', 'settings.keySecret', 'settings.phonepeDeveloperPortal', 'settings.merchantId',
  'settings.saltKey', 'settings.saltIndex', 'settings.stripeSecretKey', 'settings.stripeWebhookSigningSecret', 'settings.stripeCheckoutPriceIds',
  'settings.levelThresholds', 'settings.badges', 'learn.domain', 'learn.pythonDocs', 'learn.learnHub', 'blog.newsroom', 'signals.signals',
  'signals.timeZone', 'signals.whatsappTemplate',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

describe('admin catalog', () => {
  for (const [l, table] of [['hi', hi], ['te', te]] as const) {
    it(`${l}: every key, same placeholders, translated`, () => {
      const t = table as Record<string, string>
      expect(Object.keys(t).sort()).toEqual(Object.keys(EN).sort())
      const copied: string[] = []
      for (const [k, v] of Object.entries(EN)) {
        expect(slots(t[k]), k).toEqual(slots(v))
        if (INTENTIONALLY_ENGLISH.has(k)) continue
        if (t[k] === v && /[A-Za-z]{3}/.test(v)) copied.push(k)
        else if (/[A-Za-z]{3}/.test(v) && !SCRIPT[l].test(t[k])) copied.push(`${k} (no ${l} script)`)
      }
      expect(copied).toEqual([])
    })
  }

  it('the allow-list only names real keys', () => {
    for (const k of INTENTIONALLY_ENGLISH) expect(EN[k], k).toBeDefined()
  })

  it('every key used in the admin console exists', () => {
    const files = [...walk(path.join(ROOT, 'app/dashboard/admin')), ...walk(path.join(ROOT, 'components/admin')), ...walk(path.join(ROOT, 'components/agent'))]
    const missing: string[] = []
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8')
      if (!s.includes('useAdminT')) continue
      for (const m of s.matchAll(/\b(?:tx|t|tr|rich)\('([\w.]+)'/g)) {
        const k = m[1]
        if (!(k in EN) && !(`${k}_other` in EN)) missing.push(`${path.relative(ROOT, f)}: ${k}`)
      }
      // Keys built from data: `mentors.filter.${v}`, `mentors.action.${a}`, `market.tab.${t}`.
      for (const m of s.matchAll(/`((?:mentors|market)\.[\w.]+)\.\$\{/g)) {
        if (!Object.keys(EN).some((k) => k.startsWith(`${m[1]}.`))) missing.push(`${path.relative(ROOT, f)}: ${m[1]}.*`)
      }
    }
    expect(missing).toEqual([])
  })

  it('translator: plural, params, fallback to the key', () => {
    expect(adminTranslate('en', EN, 'users.deleted', { count: 1 })).toBe('1 user deleted')
    expect(adminTranslate('en', EN, 'users.deleted', { count: 4 })).toBe('4 users deleted')
    expect(adminTranslate('hi', { ...EN, ...(hi as Record<string, string>) }, 'userTable.page', { page: 2, total: 5 })).toMatch(/2.*5/)
    expect(adminTranslate('en', EN, 'no.such.key')).toBe('no.such.key')
  })
})

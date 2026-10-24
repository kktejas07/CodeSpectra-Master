/**
 * API error codes (lib/api-errors.ts + lib/i18n/api-error.ts):
 *  - every code the server sends exists in the catalog (map completeness),
 *  - a literal `{ error: '…', code: 'x' }` matches the catalog's English,
 *  - message → code inference is unambiguous,
 *  - the client helper: English unchanged, hi / te from code (+ params) or
 *    from a known message, unknown → the server text.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import en from '@/lib/i18n/messages/en/apiErrors.json'
import hi from '@/lib/i18n/messages/hi/apiErrors.json'
import te from '@/lib/i18n/messages/te/apiErrors.json'
import { apiErrorBody, apiErrorFor, codeForMessage, englishApiError, withErrorCode } from '@/lib/api-errors'
import { localizeApiError } from '@/lib/i18n/api-error'

const ROOT = path.resolve(__dirname, '..')
const EN = en as Record<string, string>

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

const SOURCES = [...walk(path.join(ROOT, 'app/api')), ...walk(path.join(ROOT, 'lib'))].map((f) => ({ f: path.relative(ROOT, f), s: fs.readFileSync(f, 'utf8') }))

/** Codes the cart UI branches on (not user text, several messages each) — lib/marketplace/cart.ts. */
const UI_BRANCH_CODES = new Set(['address', 'coupon'])
/** Pre-existing machine codes the clients branch on (kept as they were). */
const LEGACY_CODES = new Set<string>([])
/** Codes deliberately sent with more than one wording (the client shows the code's text). */
const SHARED_CODES = new Set(['admin_2fa_required',
  // SEO-055: machine strings kept as `error` for existing clients (native app), code carries the readable text.
  'qr_revoked', 'kyc_session_create_failed'])

describe('API error code map', () => {
  it('every code sent next to an error message is in the catalog', () => {
    const missing: string[] = []
    for (const { f, s } of SOURCES) {
      for (const m of s.matchAll(/\berror: (?:'[^'\n]*'|`[^`\n]*`|"[^"\n]*"|\w+(?:\.\w+)*), code: '([a-z0-9_]+)'/g)) {
        if (!(m[1] in EN) && !LEGACY_CODES.has(m[1])) missing.push(`${f}: ${m[1]}`)
      }
      for (const m of s.matchAll(/apiError(?:For|Body)\([^)]*?'([a-z0-9_]+)'/g)) {
        if (!(m[1] in EN)) missing.push(`${f}: ${m[1]}`)
      }
      for (const m of s.matchAll(/new (?:MktError|CartError|TalentError)\([^\n]*?,\s*'([a-z0-9_]+)'(?:\s*,\s*\{|\s*\))/g)) {
        if (!(m[1] in EN) && !UI_BRANCH_CODES.has(m[1])) missing.push(`${f}: ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('a literal message sent with a code is that code\'s English text', () => {
    const norm = (s: string) => s.trim().replace(/[’']/g, "'").replace(/\.$/, '').toLowerCase()
    const wrong: string[] = []
    for (const { f, s } of SOURCES) {
      for (const m of s.matchAll(/\berror: '((?:[^'\\\n]|\\.)*)', code: '([a-z0-9_]+)'/g)) {
        const code = m[2]
        if (!(code in EN) || /\{\w+\}/.test(EN[code]) || SHARED_CODES.has(code)) continue
        if (norm(m[1].replace(/\\'/g, "'")) !== norm(EN[code])) wrong.push(`${f}: ${code} — "${m[1]}" vs "${EN[code]}"`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('placeholder-free messages map to exactly one code', () => {
    const seen = new Map<string, string>()
    const dup: string[] = []
    for (const [k, v] of Object.entries(EN)) {
      if (/\{\w+\}/.test(v)) continue
      const n = v.trim().replace(/[’']/g, "'").replace(/\.$/, '').toLowerCase()
      if (seen.has(n)) dup.push(`${seen.get(n)} / ${k}`)
      seen.set(n, k)
    }
    expect(dup).toEqual([])
  })

  it('hi and te have every code with the same placeholders', () => {
    const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [name, table] of [['hi', hi], ['te', te]] as const) {
      const t = table as Record<string, string>
      expect(Object.keys(t).sort(), name).toEqual(Object.keys(EN).sort())
      for (const k of Object.keys(EN)) expect(slots(t[k]), `${name}.${k}`).toEqual(slots(EN[k]))
    }
  })
})

describe('server helpers', () => {
  it('infers a code from a known message and keeps the English', () => {
    expect(codeForMessage('Unauthorized')).toBe('unauthorized')
    expect(codeForMessage('Invalid JSON')).toBe('invalid_json')
    expect(codeForMessage('invalid json')).toBe('invalid_json')
    expect(codeForMessage('Something only this route says')).toBeUndefined()
    expect(apiErrorBody('Not found')).toEqual({ error: 'Not found', code: 'not_found' })
    expect(apiErrorBody('Free text')).toEqual({ error: 'Free text' })
    expect(withErrorCode({ error: 'Forbidden', extra: 1 })).toEqual({ error: 'Forbidden', extra: 1, code: 'forbidden' })
    expect(withErrorCode({ error: 'Forbidden', code: 'mine' })).toEqual({ error: 'Forbidden', code: 'mine' })
  })

  it('renders English for a code with params', () => {
    expect(englishApiError('auth_too_many_attempts', { seconds: 30 })).toBe('Too many attempts. Try again in 30s.')
    expect(apiErrorFor('contest_file_too_large', { label: 'Report', mb: 5 })).toEqual({
      error: 'Report: files can be up to 5 MB.', code: 'contest_file_too_large', params: { label: 'Report', mb: 5 },
    })
  })
})

describe('client helper (localizeApiError)', () => {
  const messages = { apiErrors: hi as Record<string, string> }
  const teMessages = { apiErrors: te as Record<string, string> }

  it('English shows the server text unchanged', () => {
    expect(localizeApiError('en', {}, { error: 'Too many attempts. Try again in 30s.', code: 'auth_too_many_attempts', params: { seconds: 30 } }, 'x')).toBe('Too many attempts. Try again in 30s.')
    expect(localizeApiError('en', {}, null, 'Fallback')).toBe('Fallback')
  })

  it('Hindi / Telugu use the code and params', () => {
    const out = localizeApiError('hi', messages, { error: 'Too many attempts. Try again in 30s.', code: 'auth_too_many_attempts', params: { seconds: 30 } }, 'x')
    expect(out).toContain('30')
    expect(out).toMatch(/[ऀ-ॿ]/)
    expect(localizeApiError('te', teMessages, { error: 'x', code: 'cart_empty' }, 'f')).toBe((te as Record<string, string>).cart_empty)
  })

  it('infers the code from a known message (routes that only send `error`)', () => {
    // SEO-055: the English table comes with the lazily loaded catalog (useApiError).
    const withEn = { ...messages, apiErrorsEn: en as Record<string, string> }
    expect(localizeApiError('hi', withEn, { error: 'Unauthorized' }, 'f')).toBe((hi as Record<string, string>).unauthorized)
    expect(localizeApiError('hi', withEn, { error: 'unauthorized.' }, 'f')).toBe((hi as Record<string, string>).unauthorized)
    // Without it only explicit codes translate.
    expect(localizeApiError('hi', messages, { error: 'Unauthorized' }, 'f')).toBe('Unauthorized')
  })

  it('falls back to the server text for unknown codes, missing params or unknown messages', () => {
    expect(localizeApiError('hi', messages, { error: 'Something specific', code: 'nope' }, 'f')).toBe('Something specific')
    expect(localizeApiError('hi', messages, { error: 'Wait 30s', code: 'auth_too_many_attempts' }, 'f')).toBe('Wait 30s')
    expect(localizeApiError('hi', messages, {}, 'Fallback')).toBe('Fallback')
    expect(localizeApiError('hi', messages, { message: 'From message' }, 'f')).toBe('From message')
  })
})

/**
 * SEO-055 ratchet: route errors the client can't translate — an `error:`
 * string literal with no `code` next to it whose text is not a catalog
 * message (exact English, so codeForMessage can't infer one). Counted per
 * app/api folder against tests/fixtures/api-error-uncoded.json; a count may
 * only go down (lower the ceiling when you fix some, never raise it).
 * Webhooks and cron answer machines, not people, so they are not counted.
 */
describe('uncoded API errors only go down (SEO-055)', () => {
  const norm = (s: string) => s.trim().replace(/[’']/g, "'").replace(/\.$/, '').toLowerCase()
  const KNOWN = new Set(Object.values(EN).filter((v) => !/\{\w+\}/.test(v)).map(norm))
  const LITERAL = /\berror: (?:'((?:[^'\\\n]|\\.)*)'|"([^"\n]*)"|`([^`\n]*)`)(?!,\s*code:)/g
  const CEILING = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/api-error-uncoded.json'), 'utf8')) as Record<string, number>

  function counts(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const { f, s } of SOURCES) {
      if (!f.startsWith('app/api/') || /\/(webhooks?|[a-z-]*-webhook)\/|^app\/api\/cron\//.test(f)) continue
      const folder = f.split('/')[2]
      for (const m of s.matchAll(LITERAL)) {
        const text = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\'/g, "'")
        if (KNOWN.has(norm(text))) continue
        out[folder] = (out[folder] ?? 0) + 1
      }
    }
    return out
  }

  it('no folder has more uncoded errors than its ceiling', () => {
    const over = Object.entries(counts()).filter(([k, n]) => n > (CEILING[k] ?? 0)).map(([k, n]) => `app/api/${k}: ${n} > ${CEILING[k] ?? 0}`)
    expect(over, 'give the new error a code (apiErrorFor / a catalog message in lib/i18n/messages/*/apiErrors.json)').toEqual([])
  })

  it('the total stays at or under the recorded ceiling', () => {
    const total = Object.values(counts()).reduce((a, b) => a + b, 0)
    // Was ~1,350 before SEO-055; lower the fixture when you fix more, never raise it.
    expect(total).toBeLessThanOrEqual(Object.values(CEILING).reduce((a, b) => a + b, 0))
  })
})

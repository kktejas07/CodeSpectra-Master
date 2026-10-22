/** Proctored certifications — pure rules (lib/pro-certs/pure.ts, lib/pro-certs/types.ts). */
import { describe, expect, it } from 'vitest'
import {
  addMonths, attemptEligibility, credentialIdFrom, credentialState, decideOutcome, isProCredentialId, linkedInAddUrl,
  publishProblems, renewedExpiry, scorePercent, selectQuestions, type PoolItem,
} from '@/lib/pro-certs/pure'
import { PROGRAM_TEMPLATES, ProgramInputSchema } from '@/lib/pro-certs/types'

const pool = (n: number, difficulty: PoolItem['difficulty'], prefix = difficulty[0], exposure = 0): PoolItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${String(i).padStart(3, '0')}`, difficulty, exposure }))

describe('selectQuestions', () => {
  const p = [...pool(30, 'Easy'), ...pool(30, 'Medium'), ...pool(20, 'Hard')]
  const mix = { Easy: 5, Medium: 5, Hard: 3 }

  it('draws the requested mix without duplicates', () => {
    const r = selectQuestions(p, mix, { seed: 'a1' })
    expect(r.ids).toHaveLength(13)
    expect(new Set(r.ids).size).toBe(13)
    expect(r.ids.filter((id) => id.startsWith('E'))).toHaveLength(5)
    expect(r.ids.filter((id) => id.startsWith('H'))).toHaveLength(3)
    expect(r.missing).toBe(0)
  })

  it('is deterministic per seed and differs across candidates', () => {
    expect(selectQuestions(p, mix, { seed: 'x' }).ids).toEqual(selectQuestions([...p].reverse(), mix, { seed: 'x' }).ids)
    const a = new Set(selectQuestions(p, mix, { seed: 'cand-1' }).ids)
    const b = selectQuestions(p, mix, { seed: 'cand-2' }).ids
    expect(b.filter((id) => a.has(id)).length).toBeLessThan(13)
  })

  it('never repeats questions the candidate already saw while fresh ones remain', () => {
    const seen = new Set(selectQuestions(p, mix, { seed: 'first' }).ids)
    const r = selectQuestions(p, mix, { seed: 'second', seen })
    expect(r.ids.some((id) => seen.has(id))).toBe(false)
    expect(r.repeated).toBe(0)
  })

  it('caps over-exposed questions and favours least-used ones', () => {
    const hot = pool(10, 'Easy', 'X', 100)
    const cold = pool(10, 'Easy', 'C', 0)
    let hotPicked = 0
    for (let i = 0; i < 50; i++) hotPicked += selectQuestions([...hot, ...cold], { Easy: 5, Medium: 0, Hard: 0 }, { seed: `s${i}` }).ids.filter((id) => id.startsWith('X')).length
    expect(hotPicked).toBe(0)
  })

  it('exposure weighting still spreads draws over the pool', () => {
    const counts = new Map<string, number>()
    const items = pool(20, 'Medium')
    for (let i = 0; i < 200; i++) {
      for (const id of selectQuestions(items, { Easy: 0, Medium: 5, Hard: 0 }, { seed: `k${i}` }).ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    expect(counts.size).toBe(20)
  })

  it('tops up from neighbouring difficulties, then from seen questions, and reports what is missing', () => {
    const small = [...pool(2, 'Hard'), ...pool(10, 'Medium')]
    const r = selectQuestions(small, { Easy: 0, Medium: 3, Hard: 4 }, { seed: 't' })
    expect(r.shortfall.Hard).toBe(2)
    expect(r.ids).toHaveLength(7)
    const seenAll = new Set(small.map((x) => x.id))
    const r2 = selectQuestions(small, { Easy: 0, Medium: 3, Hard: 0 }, { seed: 'u', seen: seenAll })
    expect(r2.repeated).toBe(3)
    const r3 = selectQuestions(pool(2, 'Easy'), { Easy: 5, Medium: 0, Hard: 0 }, { seed: 'v' })
    expect(r3.missing).toBe(3)
  })
})

describe('attemptEligibility', () => {
  const program = { status: 'published' as const, attempts: { cooldown_days: 14, max_per_year: 3 }, renewal_window_days: 90 }
  const now = new Date('2026-10-23T00:00:00Z')

  it('allows a first attempt and blocks an open one', () => {
    expect(attemptEligibility({ program, attempts: [], credential: null, now })).toEqual({ ok: true, renewal: null })
    expect(attemptEligibility({ program, attempts: [{ status: 'ready', created_at: '2026-10-20T00:00:00Z', decided_at: null }], credential: null, now })).toMatchObject({ ok: false, reason: 'open_attempt' })
  })

  it('enforces the cooldown after a failed or rejected attempt', () => {
    const r = attemptEligibility({ program, attempts: [{ status: 'failed', created_at: '2026-10-10T00:00:00Z', decided_at: '2026-10-15T00:00:00Z' }], credential: null, now })
    expect(r).toEqual({ ok: false, reason: 'cooldown', retry_at: '2026-10-29T00:00:00.000Z' })
    expect(attemptEligibility({ program, attempts: [{ status: 'rejected', created_at: '2026-09-01T00:00:00Z', decided_at: '2026-09-02T00:00:00Z' }], credential: null, now }).ok).toBe(true)
  })

  it('caps attempts per rolling year (voided attempts do not count)', () => {
    const a = (d: string, status: 'failed' | 'void' = 'failed') => ({ status, created_at: d, decided_at: d })
    const r = attemptEligibility({ program, attempts: [a('2026-01-10T00:00:00Z'), a('2026-04-10T00:00:00Z'), a('2026-07-10T00:00:00Z')], credential: null, now })
    expect(r).toMatchObject({ ok: false, reason: 'yearly_limit', retry_at: '2027-01-10T00:00:00.000Z' })
    expect(attemptEligibility({ program, attempts: [a('2026-01-10T00:00:00Z', 'void'), a('2026-04-10T00:00:00Z'), a('2026-07-10T00:00:00Z')], credential: null, now }).ok).toBe(true)
  })

  it('holders can only buy a renewal inside the renewal window', () => {
    const far = { id: 'CSC-AAAAA-AAAAA-AAAAA-AAAAA', status: 'active' as const, expires_at: '2027-10-01T00:00:00Z' }
    expect(attemptEligibility({ program, attempts: [], credential: far, now })).toMatchObject({ ok: false, reason: 'already_certified' })
    const soon = { ...far, expires_at: '2026-12-01T00:00:00Z' }
    expect(attemptEligibility({ program, attempts: [], credential: soon, now })).toEqual({ ok: true, renewal: far.id })
    expect(attemptEligibility({ program: { ...program, status: 'draft' as never }, attempts: [], credential: null, now })).toMatchObject({ ok: false, reason: 'not_published' })
  })
})

describe('decideOutcome', () => {
  const base = { passPercent: 65, minTrust: 70, review: 'always' as const }
  it('fails below the pass mark without review', () => {
    expect(decideOutcome({ ...base, scorePct: 64.9, trust: 95 })).toEqual({ decision: 'failed', flags: [] })
  })
  it('holds every pass for review under the "always" policy', () => {
    expect(decideOutcome({ ...base, scorePct: 80, trust: 95 }).decision).toBe('review')
  })
  it('issues clean passes only under "below_threshold", never with low or missing trust', () => {
    expect(decideOutcome({ ...base, review: 'below_threshold', scorePct: 80, trust: 95 })).toEqual({ decision: 'issue', flags: [] })
    expect(decideOutcome({ ...base, review: 'below_threshold', scorePct: 80, trust: 50 })).toEqual({ decision: 'review', flags: ['low_trust'] })
    expect(decideOutcome({ ...base, review: 'below_threshold', scorePct: 80, trust: null })).toEqual({ decision: 'review', flags: ['no_integrity_data'] })
    expect(decideOutcome({ ...base, review: 'below_threshold', scorePct: 80, trust: 90, identityFlagged: true }).decision).toBe('review')
  })
  it('scorePercent clamps and guards zero max', () => {
    expect(scorePercent(7, 10)).toBe(70)
    expect(scorePercent(5, 0)).toBe(0)
    expect(scorePercent(12, 10)).toBe(100)
  })
})

describe('credentials', () => {
  it('ids are well formed and recognised', () => {
    const id = credentialIdFrom(new Uint8Array(Array.from({ length: 20 }, (_, i) => i * 13)))
    expect(isProCredentialId(id)).toBe(true)
    expect(isProCredentialId('csp1.abc')).toBe(false)
    expect(isProCredentialId('CSC-IIIII-AAAAA-AAAAA-AAAAA')).toBe(false)
  })
  it('expiry adds months, clamped to month end', () => {
    expect(addMonths('2026-01-31T10:00:00.000Z', 1)).toBe('2026-02-28T10:00:00.000Z')
    expect(addMonths('2026-10-23T00:00:00.000Z', 24)).toBe('2028-10-23T00:00:00.000Z')
  })
  it('renewal continues from the old expiry when renewed early, from today when lapsed', () => {
    expect(renewedExpiry('2026-12-01T00:00:00.000Z', '2026-10-23T00:00:00.000Z', 24)).toBe('2028-12-01T00:00:00.000Z')
    expect(renewedExpiry('2026-01-01T00:00:00.000Z', '2026-10-23T00:00:00.000Z', 24)).toBe('2028-10-23T00:00:00.000Z')
  })
  it('state reflects revoked / renewed / expiry', () => {
    const now = new Date('2026-10-23T00:00:00Z')
    expect(credentialState({ status: 'active', expires_at: '2027-01-01T00:00:00Z' }, now)).toBe('valid')
    expect(credentialState({ status: 'active', expires_at: '2026-01-01T00:00:00Z' }, now)).toBe('expired')
    expect(credentialState({ status: 'revoked', expires_at: '2027-01-01T00:00:00Z' }, now)).toBe('revoked')
    expect(credentialState({ status: 'renewed', expires_at: '2027-01-01T00:00:00Z' }, now)).toBe('renewed')
  })
  it('LinkedIn add-to-profile link carries name, dates, id and verify URL', () => {
    const u = new URL(linkedInAddUrl({ title: 'Java Associate', issuedAt: '2026-10-23T00:00:00Z', expiresAt: '2028-10-23T00:00:00Z', credentialId: 'CSC-A', verifyUrl: 'https://codespectra.ai/verify/CSC-A' }))
    expect(u.origin + u.pathname).toBe('https://www.linkedin.com/profile/add')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ startTask: 'CERTIFICATION_NAME', name: 'Java Associate', issueYear: '2026', issueMonth: '10', expirationYear: '2028', expirationMonth: '10', certId: 'CSC-A', certUrl: 'https://codespectra.ai/verify/CSC-A', organizationName: 'CodeSpectra' })
  })
})

describe('program schema + templates', () => {
  it('every starter template is a valid program once priced, and publishable', () => {
    for (const t of PROGRAM_TEMPLATES) {
      const r = ProgramInputSchema.safeParse({ ...t, price: { INR: 49900, USD: null } })
      expect(r.success, t.slug).toBe(true)
      if (r.success) expect(publishProblems(r.data), t.slug).toEqual([])
    }
    expect(PROGRAM_TEMPLATES.map((t) => t.slug)).toEqual(['java-associate', 'python-associate', 'sql-practitioner', 'dsa-fundamentals', 'frontend-react', 'aptitude-placements'])
  })
  it('publishing needs a price and timed sections that fit', () => {
    const t = { ...PROGRAM_TEMPLATES[0], price: { INR: null, USD: null } }
    expect(publishProblems(t as never)).toContain('price_missing')
    const tight = { ...t, price: { INR: 100, USD: null }, blueprint: { ...t.blueprint, duration_min: 30 } }
    expect(publishProblems(tight as never)).toContain('section_minutes_exceed_duration')
  })
  it('rejects unknown fields and bad slugs', () => {
    expect(ProgramInputSchema.safeParse({ ...PROGRAM_TEMPLATES[0], price: { INR: 1, USD: null }, extra: 1 }).success).toBe(false)
    expect(ProgramInputSchema.safeParse({ ...PROGRAM_TEMPLATES[0], price: { INR: 1, USD: null }, slug: 'Bad Slug' }).success).toBe(false)
  })
})

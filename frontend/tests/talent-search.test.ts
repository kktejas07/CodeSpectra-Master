import { describe, expect, it } from 'vitest'
import {
  buildSearchFilter, canRespond, consentCopy, consentRegime, contactFor, monthKey, normalizeTalentSettings, rankResults,
  sendInviteSchema, talentProfileSchema, talentSearchSchema, toTalentResult, DEFAULT_TALENT_SETTINGS,
} from '@/lib/talent/core'

describe('consent wording', () => {
  it('picks DPDP for India, GDPR for EU/UK, general otherwise', () => {
    expect(consentRegime('in')).toBe('dpdp')
    expect(consentRegime('DE')).toBe('gdpr')
    expect(consentRegime('GB')).toBe('gdpr')
    expect(consentRegime('US')).toBe('general')
    expect(consentRegime(null)).toBe('general')
    expect(consentCopy('dpdp').title).toMatch(/Digital Personal Data Protection/)
    expect(consentCopy('gdpr').points.join(' ')).toMatch(/Art\. 6\(1\)\(a\)/)
    for (const r of ['dpdp', 'gdpr', 'general'] as const) expect(consentCopy(r).points.join(' ')).toMatch(/not your email or phone/)
  })
})

describe('profile + search input', () => {
  it('validates the opt-in body strictly', () => {
    expect(talentProfileSchema.safeParse({ discoverable: true, consent: true, country: 'in' }).data?.country).toBe('IN')
    expect(talentProfileSchema.safeParse({ discoverable: true, email: 'x' }).success).toBe(false)
    expect(talentProfileSchema.safeParse({ discoverable: true, graduation_year: 1800 }).success).toBe(false)
  })
  it('caps skills and pages', () => {
    expect(talentSearchSchema.safeParse({ skills: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false)
    expect(talentSearchSchema.parse({})).toMatchObject({ skills: [], min_level: 'beginner', page: 1, limit: 20 })
    expect(talentSearchSchema.safeParse({ limit: 500 }).success).toBe(false)
  })
})

describe('search filter', () => {
  const q = talentSearchSchema.parse({ skills: ['JS', 'sql'], min_level: 'advanced', country: 'in', graduation_year_min: 2024, availability: ['immediately'] })
  const f = buildSearchFilter(q, 'tenant-1') as { $and: Record<string, unknown>[] }
  it('always requires opt-in, consent, a shared passport and no block', () => {
    expect(f.$and).toEqual(expect.arrayContaining([
      { 'talent.discoverable': true },
      { 'talent.consent.at': { $type: 'string' } },
      { visibility: { $ne: 'private' } },
      { 'talent.blocked_tenants': { $ne: 'tenant-1' } },
    ]))
  })
  it('matches every canonical skill at or above the level', () => {
    expect(f.$and).toEqual(expect.arrayContaining([
      { skills_index: { $elemMatch: { skill: 'javascript', rank: { $gte: 2 } } } },
      { skills_index: { $elemMatch: { skill: 'sql', rank: { $gte: 2 } } } },
      { 'talent.country': 'IN' },
      { 'talent.graduation_year': { $gte: 2024 } },
      { 'talent.availability': { $in: ['immediately'] } },
    ]))
  })
  it('escapes the city regex', () => {
    const g = buildSearchFilter(talentSearchSchema.parse({ city: 'a.*' }), 't') as { $and: Array<Record<string, { $regex?: string }>> }
    expect(g.$and.find((x) => 'talent.city' in x)?.['talent.city'].$regex).toBe('^a\\.\\*$')
  })
})

describe('results', () => {
  const doc = { handle: 'priya', display_name: 'Priya', computed_at: '2026-10-01', user_id: 'secret', email: 'p@x.com', talent: { city: 'Hyderabad', country: 'IN', graduation_year: 2025, availability: 'immediately', blocked_tenants: ['t9'], consent: { at: 'x' } }, skills_index: [{ skill: 'react', level: 'expert', rank: 3, score: 90 }, { skill: 'sql', level: 'intermediate', rank: 1, score: 60 }] }
  it('never carries contact or internal fields', () => {
    const r = toTalentResult(doc, ['sql'])
    expect(JSON.stringify(r)).not.toMatch(/p@x\.com|secret|t9|consent/)
    expect(r.skills[0].skill).toBe('sql') // matched skill first
  })
  it('ranks by match', () => {
    const a = toTalentResult(doc, ['react'])
    const b = toTalentResult({ ...doc, handle: 'b', skills_index: [{ skill: 'react', level: 'beginner', rank: 0, score: 40 }] }, ['react'])
    expect(rankResults([b, a]).map((r) => r.handle)).toEqual(['priya', 'b'])
  })
})

describe('invites', () => {
  const inv = { status: 'pending' as const, expires_at: '2026-11-01T00:00:00Z', learner_id: 'u1' }
  it('only the invited learner can answer a pending, unexpired invite', () => {
    const now = Date.parse('2026-10-21T00:00:00Z')
    expect(canRespond(inv, 'u1', now)).toEqual({ ok: true })
    expect(canRespond(inv, 'u2', now)).toMatchObject({ ok: false, status: 404 })
    expect(canRespond({ ...inv, status: 'accepted' }, 'u1', now)).toMatchObject({ ok: false, status: 409 })
    expect(canRespond(inv, 'u1', Date.parse('2026-12-01'))).toMatchObject({ ok: false, status: 410 })
  })
  it('contact details only after accept', () => {
    expect(contactFor({ status: 'pending' }, { email: 'a@b.c' })).toBeNull()
    expect(contactFor({ status: 'declined' }, { email: 'a@b.c' })).toBeNull()
    expect(contactFor({ status: 'accepted' }, { email: 'a@b.c' })).toEqual({ email: 'a@b.c', phone: null })
  })
  it('validates invite input', () => {
    expect(sendInviteSchema.safeParse({ handle: 'priya', target_type: 'job', target_id: 'j1' }).success).toBe(true)
    expect(sendInviteSchema.safeParse({ handle: 'priya', target_type: 'job', target_id: '{$ne:1}' }).success).toBe(false)
    expect(sendInviteSchema.safeParse({ handle: 'priya', target_type: 'offer', target_id: 'j1' }).success).toBe(false)
  })
})

describe('settings', () => {
  it('safe defaults and ignores junk', () => {
    expect(normalizeTalentSettings(null)).toEqual(DEFAULT_TALENT_SETTINGS)
    expect(normalizeTalentSettings({ _id: 'global', monthly_invites_per_tenant: 5, updated_by: 'x' }).monthly_invites_per_tenant).toBe(5)
    expect(normalizeTalentSettings({ monthly_invites_per_tenant: -1 })).toEqual(DEFAULT_TALENT_SETTINGS)
    expect(monthKey(new Date('2026-10-21T10:00:00Z'))).toBe('2026-10')
  })
})

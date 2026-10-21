/**
 * Mentor marketplace (lib/mentors/pure.ts + the daily cap in lib/marketplace/slots.ts):
 * slot generation across time zones with buffer + max sessions per day, session price /
 * commission quote in minor units, reschedule policy, validation, rating and directory.
 */
import { describe, it, expect } from 'vitest'
import { generateSlots } from '@/lib/marketplace/slots'
import {
  aggregateRating, filterDirectory, isListable, isRepoLink, mentorSlots, nextMentorStatus, offeringProductPayload, offeringTypeOf,
  overlappingWindows, parseAvailability, parseDirectoryQuery, ProfileSchema, OfferingSchema, quoteSession, rescheduleEligibility,
} from '@/lib/mentors/pure'
import { validateProduct } from '@/lib/marketplace/listings'
import type { MentorAvailability, PublicMentor } from '@/lib/mentors/types'

const IST: MentorAvailability = { timezone: 'Asia/Kolkata', weekly: [{ dow: 1, start: '18:00', end: '21:00' }], buffer_min: 15, max_per_day: 0 }
// Monday 2026-11-02 00:00 IST = 2026-11-01T18:30Z
const MON = Date.parse('2026-11-01T18:30:00Z')
const DAY = 86_400_000

describe('mentor slots', () => {
  it('generates Monday evening IST slots as UTC instants with the buffer between them', () => {
    const s = mentorSlots(IST, 60, { fromMs: MON, toMs: MON + DAY, nowMs: MON - 7 * DAY, taken: [] })
    // 18:00, 19:15 (19:15–20:15), 20:30 would end 21:30 > 21:00 → two slots
    expect(s).toEqual(['2026-11-02T12:30:00.000Z', '2026-11-02T13:45:00.000Z'])
  })

  it('caps sessions per seller-local day (all of the mentor\'s bookings count)', () => {
    const a = { ...IST, weekly: [{ dow: 1, start: '09:00', end: '21:00' }], buffer_min: 0, max_per_day: 2 }
    const taken = [{ start: '2026-11-02T04:30:00.000Z', end: '2026-11-02T05:30:00.000Z' }]
    expect(mentorSlots(a, 60, { fromMs: MON, toMs: MON + DAY, nowMs: MON - DAY, taken }).length).toBeGreaterThan(5)
    const two = [...taken, { start: '2026-11-02T06:30:00.000Z', end: '2026-11-02T07:30:00.000Z' }]
    expect(mentorSlots(a, 60, { fromMs: MON, toMs: MON + DAY, nowMs: MON - DAY, taken: two })).toEqual([])
  })

  it('a booking on another local day does not count towards today\'s cap', () => {
    const a = { ...IST, weekly: [{ dow: 1, start: '09:00', end: '12:00' }, { dow: 2, start: '09:00', end: '12:00' }], buffer_min: 0, max_per_day: 1 }
    // Tuesday 09:00 IST booked
    const taken = [{ start: '2026-11-03T03:30:00.000Z', end: '2026-11-03T04:30:00.000Z' }]
    const s = mentorSlots(a, 60, { fromMs: MON, toMs: MON + 2 * DAY, nowMs: MON - DAY, taken })
    expect(s.every((x) => x < '2026-11-02T18:30:00.000Z')).toBe(true)
    expect(s).toHaveLength(3)
  })

  it('without a cap the marketplace generator behaves as before', () => {
    const spec = { duration_min: 60, weekly: IST.weekly, timezone: IST.timezone, buffer_min: 15 }
    expect(generateSlots(spec, { fromMs: MON, toMs: MON + DAY, nowMs: MON - DAY })).toEqual(mentorSlots(IST, 60, { fromMs: MON, toMs: MON + DAY, nowMs: MON - DAY, taken: [] }))
  })

  it('respects the lead time and DST in a US time zone', () => {
    const ny: MentorAvailability = { timezone: 'America/New_York', weekly: [{ dow: 0, start: '10:00', end: '11:00' }], buffer_min: 0, max_per_day: 0 }
    // Sunday 2026-11-01 is the DST end day in the US: 10:00 EST = 15:00Z
    const s = mentorSlots(ny, 60, { fromMs: Date.parse('2026-11-01T00:00:00Z'), toMs: Date.parse('2026-11-02T00:00:00Z'), nowMs: Date.parse('2026-10-25T00:00:00Z'), taken: [] })
    expect(s).toEqual(['2026-11-01T15:00:00.000Z'])
    const late = mentorSlots(ny, 60, { fromMs: Date.parse('2026-11-01T00:00:00Z'), toMs: Date.parse('2026-11-02T00:00:00Z'), nowMs: Date.parse('2026-11-01T14:00:00Z'), taken: [] })
    expect(late).toEqual([]) // within the 2 h lead
  })
})

describe('session pricing and commission', () => {
  const settings = { tax: { in_gst_bps: 1800, us_sales_tax_bps: 0, prices_include_tax: true }, default_commission_bps: 1500, category_commission_bps: { 'mock-interviews': 2000 } }
  it('INR price includes GST; commission on the ex-tax base; integers that add up', () => {
    const q = quoteSession(118_000, 'INR', 'career_guidance', { is_platform: false, commission_bps: null }, settings)
    expect(q.buyer_total).toBe(118_000)
    expect(q.tax).toBe(18_000)
    expect(q.commission_bps).toBe(1500)
    expect(q.platform_commission + q.mentor_earnings).toBe(100_000)
    expect(q.platform_commission).toBe(15_000)
    expect(Number.isInteger(q.mentor_earnings)).toBe(true)
  })
  it('category override for mock interviews, seller override wins over category', () => {
    expect(quoteSession(10_000, 'USD', 'mock_interview', { is_platform: false, commission_bps: null }, settings).commission_bps).toBe(2000)
    expect(quoteSession(10_000, 'USD', 'mock_interview', { is_platform: false, commission_bps: 500 }, settings).commission_bps).toBe(500)
    expect(quoteSession(10_000, 'USD', 'mock_interview', { is_platform: true, commission_bps: null }, settings).platform_commission).toBe(0)
  })
  it('USD with tax added on top', () => {
    const q = quoteSession(5_000, 'USD', 'code_review', { is_platform: false, commission_bps: null }, { ...settings, tax: { in_gst_bps: 1800, us_sales_tax_bps: 800, prices_include_tax: false } })
    expect(q.buyer_total).toBe(5_400)
    expect(q.platform_commission + q.mentor_earnings).toBe(5_000)
  })
})

describe('offerings → marketplace products', () => {
  it('builds a valid service product with the mentor availability', () => {
    const o = OfferingSchema.parse({ type: 'code_review', description_md: 'We go through your code line by line together.', duration_min: 45, currency: 'INR', price: 99_900 })
    const payload = offeringProductPayload(o, { ...IST, max_per_day: 3 }, 'Asha')
    const v = validateProduct(payload, { strict: true })
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.value.service).toMatchObject({ duration_min: 45, provider: 'livekit', timezone: 'Asia/Kolkata', buffer_min: 15, max_per_day: 3 })
      expect(v.value.category).toBe('mentoring')
      expect(offeringTypeOf(v.value)).toBe('code_review')
    }
  })
  it('rejects odd durations and fractional prices', () => {
    expect(OfferingSchema.safeParse({ type: 'mock_interview', description_md: 'x'.repeat(30), duration_min: 50, currency: 'INR', price: 1000 }).success).toBe(false)
    expect(OfferingSchema.safeParse({ type: 'mock_interview', description_md: 'x'.repeat(30), duration_min: 60, currency: 'INR', price: 10.5 }).success).toBe(false)
  })
})

describe('reschedule policy', () => {
  const policy = { reschedule_hours: 12, max_reschedules: 1 }
  const now = Date.parse('2026-11-01T00:00:00Z')
  const b = { status: 'booked', start: '2026-11-02T12:30:00.000Z' }
  it('allows before the cutoff, once', () => {
    expect(rescheduleEligibility(b, 0, policy, '2026-11-03T12:30:00.000Z', now)).toEqual({ ok: true })
    expect(rescheduleEligibility(b, 1, policy, '2026-11-03T12:30:00.000Z', now).ok).toBe(false)
  })
  it('refuses inside the cutoff, after start, same time or not booked', () => {
    expect(rescheduleEligibility(b, 0, policy, '2026-11-03T12:30:00.000Z', Date.parse('2026-11-02T02:00:00Z')).ok).toBe(false)
    expect(rescheduleEligibility(b, 0, policy, '2026-11-03T12:30:00.000Z', Date.parse('2026-11-02T13:00:00Z')).ok).toBe(false)
    expect(rescheduleEligibility(b, 0, policy, b.start, now).ok).toBe(false)
    expect(rescheduleEligibility({ ...b, status: 'cancelled' }, 0, policy, '2026-11-03T12:30:00.000Z', now).ok).toBe(false)
    expect(rescheduleEligibility(b, 0, { ...policy, max_reschedules: 0 }, '2026-11-03T12:30:00.000Z', now).ok).toBe(false)
  })
})

describe('validation, status, rating, directory', () => {
  it('availability: valid time zone, no overlapping windows', () => {
    expect(parseAvailability({ timezone: 'Asia/Kolkata', weekly: [{ dow: 1, start: '09:00', end: '12:00' }], buffer_min: 10, max_per_day: 3 }).ok).toBe(true)
    expect(parseAvailability({ timezone: 'Mars/Base', weekly: [], buffer_min: 0, max_per_day: 0 }).ok).toBe(false)
    expect(overlappingWindows([{ dow: 1, start: '09:00', end: '12:00' }, { dow: 1, start: '11:00', end: '13:00' }])).toBe(true)
    expect(overlappingWindows([{ dow: 1, start: '09:00', end: '12:00' }, { dow: 2, start: '11:00', end: '13:00' }])).toBe(false)
  })
  it('profile: needs skills and a real bio; LinkedIn only', () => {
    const base = { headline: 'Backend engineer at a product company', bio: 'I have built payment systems for eight years and love teaching.', skills: ['Java', 'java', ' '], companies: [], experience_years: 8, languages: ['English'] }
    const r = ProfileSchema.safeParse(base)
    expect(r.success && r.data.skills).toEqual(['Java', 'java'])
    expect(ProfileSchema.safeParse({ ...base, skills: [] }).success).toBe(false)
    expect(ProfileSchema.safeParse({ ...base, linkedin_url: 'https://evil.example/in/x' }).success).toBe(false)
  })
  it('status transitions and listing rule', () => {
    expect(nextMentorStatus('pending', 'verify')).toBe('verified')
    expect(nextMentorStatus('verified', 'reject')).toBeNull()
    expect(nextMentorStatus('verified', 'suspend')).toBe('suspended')
    expect(nextMentorStatus('suspended', 'reinstate')).toBe('verified')
    expect(isListable('verified', 'approved', 1)).toBe(true)
    expect(isListable('verified', 'pending', 1)).toBe(false)
    expect(isListable('pending', 'approved', 1)).toBe(false)
  })
  it('rating ignores invalid rows; repo links only from code hosts', () => {
    expect(aggregateRating([{ rating: 5 }, { rating: 4 }, { rating: 0 }])).toEqual({ avg: 4.5, count: 2 })
    expect(aggregateRating([])).toEqual({ avg: 0, count: 0 })
    expect(isRepoLink('https://github.com/a/b')).toBe(true)
    expect(isRepoLink('http://github.com/a/b')).toBe(false)
    expect(isRepoLink('https://evil.com/a')).toBe(false)
  })
  it('directory filters by skill, company and session type; sorts by price', () => {
    const m = (slug: string, skills: string[], companies: string[], price: number, type: 'mock_interview' | 'code_review'): PublicMentor => ({
      slug, display_name: slug, headline: '', bio: '', skills, companies, experience_years: 3, languages: [], rating: { avg: 0, count: 0 }, sessions_completed: 0,
      offerings: [{ product_id: slug, slug, type, title: '', description_md: '', duration_min: 60, currency: 'INR', price, mode: 'virtual', timezone: 'UTC' }], from_price: { INR: price }, timezone: 'UTC',
    })
    const list = [m('a', ['React'], ['Google'], 2000, 'mock_interview'), m('b', ['Java'], ['TCS'], 1000, 'code_review')]
    expect(filterDirectory(list, parseDirectoryQuery({ skill: 'react' })).map((x) => x.slug)).toEqual(['a'])
    expect(filterDirectory(list, parseDirectoryQuery({ company: 'tcs' })).map((x) => x.slug)).toEqual(['b'])
    expect(filterDirectory(list, parseDirectoryQuery({ type: 'code_review' })).map((x) => x.slug)).toEqual(['b'])
    expect(filterDirectory(list, parseDirectoryQuery({ sort: 'price' })).map((x) => x.slug)).toEqual(['b', 'a'])
    expect(parseDirectoryQuery({ type: 'nope', sort: 'x' })).toEqual({})
  })
})

/**
 * Mentor marketplace — pure functions (unit tested in tests/mentors.test.ts):
 * input validation, offering → marketplace product payload, session price / commission
 * quote, slot generation with the daily cap, reschedule policy, rating aggregation and the
 * /mentors directory filter. Money is integer minor units (paise / cents) throughout.
 */
import { z } from 'zod'
import { generateSlots, isValidTimeZone, type ServiceSpec } from '@/lib/marketplace/slots'
import { computeQuote } from '@/lib/marketplace/pricing'
import { commissionFor } from '@/lib/marketplace/ledger'
import type { Currency, MarketplaceSettings, Seller } from '@/lib/marketplace/contract'
import {
  DEFAULT_AVAILABILITY, DEFAULT_POLICY, OFFERING_CATEGORY, OFFERING_LABELS, OFFERING_TYPES,
  type MentorAvailability, type MentorPolicy, type MentorProfile, type MentorStatus, type OfferingType, type PublicMentor,
} from './types'

export const MAX_SESSION_PRICE = 10_000_000 // ₹1,00,000 / $100,000 in minor units
export const DURATIONS = [15, 30, 45, 60, 90, 120] as const

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
const tagList = (max: number, len: number) => z.array(z.string().max(len)).max(max * 2).transform((a) => [...new Set(a.map(clean).filter(Boolean))].slice(0, max))
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

const httpsUrl = z.string().trim().max(500).refine((u) => /^https:\/\/[^\s<>"']+$/i.test(u), 'Use an https:// link')

export const ProfileSchema = z.object({
  headline: z.string().max(140).transform(clean).refine((s) => s.length >= 8, 'Headline must be at least 8 characters'),
  bio: z.string().max(4000).transform((s) => s.replace(/\r\n/g, '\n').trim()).refine((s) => s.length >= 40, 'Tell learners a bit more (at least 40 characters)'),
  skills: tagList(20, 40).refine((a) => a.length >= 1, 'Add at least one skill'),
  companies: tagList(10, 60),
  experience_years: z.coerce.number().int().min(0).max(50),
  languages: tagList(8, 30),
  linkedin_url: z.union([httpsUrl.refine((u) => /^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(u), 'Use a linkedin.com link'), z.literal(''), z.null()]).optional(),
  avatar_url: z.union([httpsUrl, z.literal(''), z.null()]).optional(),
}).strict()

export type ProfileInput = z.infer<typeof ProfileSchema>

const weeklyRule = z.object({ dow: z.coerce.number().int().min(0).max(6), start: z.string().regex(HHMM), end: z.string().regex(HHMM) })
  .refine((r) => r.start < r.end, 'Each window must start before it ends')

export const AvailabilitySchema = z.object({
  timezone: z.string().max(64).refine(isValidTimeZone, 'Choose a valid time zone'),
  weekly: z.array(weeklyRule).max(35),
  buffer_min: z.coerce.number().int().min(0).max(120),
  max_per_day: z.coerce.number().int().min(0).max(12),
  reschedule_hours: z.coerce.number().int().min(2).max(168).optional(),
  max_reschedules: z.coerce.number().int().min(0).max(3).optional(),
}).strict()

export const OfferingSchema = z.object({
  type: z.enum(OFFERING_TYPES),
  title: z.string().max(120).transform(clean).refine((s) => s.length >= 3, 'Title must be at least 3 characters').optional(),
  description_md: z.string().max(5000).transform((s) => s.trim()).refine((s) => s.length >= 20, 'Describe the session in at least 20 characters'),
  duration_min: z.coerce.number().int().refine((n) => (DURATIONS as readonly number[]).includes(n), 'Choose 15, 30, 45, 60, 90 or 120 minutes'),
  currency: z.enum(['INR', 'USD']),
  /** integer minor units */
  price: z.coerce.number().int().min(0).max(MAX_SESSION_PRICE),
  provider: z.enum(['livekit', 'zoom', 'google_meet', 'teams']).optional(),
}).strict()

export type OfferingInput = z.infer<typeof OfferingSchema>

export function firstError(e: z.ZodError): string {
  const i = e.issues[0]
  return i ? (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message) : 'Invalid input'
}

/** Overlapping / duplicate weekly windows on the same day are rejected (they would double the slots). */
export function overlappingWindows(weekly: { dow: number; start: string; end: string }[]): boolean {
  const byDay = new Map<number, { start: string; end: string }[]>()
  for (const r of weekly) byDay.set(r.dow, [...(byDay.get(r.dow) || []), r])
  for (const rows of byDay.values()) {
    const s = [...rows].sort((a, b) => a.start.localeCompare(b.start))
    for (let i = 1; i < s.length; i++) if (s[i].start < s[i - 1].end) return true
  }
  return false
}

export function parseAvailability(raw: unknown): { ok: true; availability: MentorAvailability; policy: Partial<MentorPolicy> } | { ok: false; error: string } {
  const r = AvailabilitySchema.safeParse(raw)
  if (!r.success) return { ok: false, error: firstError(r.error) }
  if (overlappingWindows(r.data.weekly)) return { ok: false, error: 'Two availability windows overlap on the same day.' }
  const { reschedule_hours, max_reschedules, ...a } = r.data
  const policy: Partial<MentorPolicy> = {}
  if (reschedule_hours !== undefined) policy.reschedule_hours = reschedule_hours
  if (max_reschedules !== undefined) policy.max_reschedules = max_reschedules
  return { ok: true, availability: { ...a, weekly: [...a.weekly].sort((x, y) => x.dow - y.dow || x.start.localeCompare(y.start)) }, policy }
}

/** Offering → the payload lib/marketplace/listings.ts validateProduct() accepts (kind = service). */
export function offeringProductPayload(o: OfferingInput, a: MentorAvailability, mentorName: string): Record<string, unknown> {
  return {
    kind: 'service',
    title: o.title || `${OFFERING_LABELS[o.type]} with ${mentorName}`.slice(0, 120),
    description_md: o.description_md,
    images: [],
    category: OFFERING_CATEGORY[o.type],
    tags: ['mentor', `offering:${o.type}`],
    currency: o.currency,
    price: o.price,
    service: {
      duration_min: o.duration_min,
      mode: 'virtual',
      provider: o.provider || 'livekit',
      timezone: a.timezone,
      buffer_min: a.buffer_min,
      max_per_day: a.max_per_day,
      weekly: a.weekly,
    },
  }
}

/** Offering type from a product's tags (set by offeringProductPayload). */
export function offeringTypeOf(p: { tags?: string[]; category?: string }): OfferingType | null {
  const t = (p.tags || []).find((x) => x.startsWith('offering:'))?.slice(9)
  if (t && (OFFERING_TYPES as readonly string[]).includes(t)) return t as OfferingType
  return p.category === 'mock-interviews' ? 'mock_interview' : null
}

export interface SessionQuote {
  currency: Currency
  price: number
  /** what the buyer pays (incl. tax when prices exclude tax) */
  buyer_total: number
  tax: number
  commission_bps: number
  platform_commission: number
  mentor_earnings: number
}

/**
 * The marketplace's own money math for one session (computeQuote + commissionFor), so the
 * mentor studio preview always matches what checkout and the ledger will do.
 */
export function quoteSession(
  price: number,
  currency: Currency,
  type: OfferingType,
  seller: Pick<Seller, 'is_platform' | 'commission_bps'>,
  settings: Pick<MarketplaceSettings, 'tax' | 'default_commission_bps' | 'category_commission_bps'>,
): SessionQuote {
  const commission_bps = commissionFor({ category: OFFERING_CATEGORY[type] }, seller, settings)
  const q = computeQuote([{ key: 's', seller_id: 's', kind: 'service', unit_price: price, qty: 1, commission_bps }], { currency, settings })
  const l = q.lines[0]
  return { currency, price, buyer_total: q.grand_total, tax: q.tax_total, commission_bps, platform_commission: l.commission_amount, mentor_earnings: l.seller_earnings }
}

/** Slots for one offering under the mentor's availability (cap counts all the mentor's sessions). */
export function mentorSlots(
  a: MentorAvailability,
  durationMin: number,
  q: { fromMs: number; toMs: number; nowMs: number; taken: { start: string; end: string }[]; minLeadMin?: number; max?: number },
): string[] {
  const spec: ServiceSpec = { duration_min: durationMin, weekly: a.weekly, timezone: a.timezone, buffer_min: a.buffer_min, max_per_day: a.max_per_day }
  return generateSlots(spec, q)
}

export type RescheduleCheck = { ok: true } | { ok: false; reason: string }

/** Buyer reschedule: booked, not started, before the policy cutoff, under the reschedule limit. */
export function rescheduleEligibility(
  b: { status: string; start: string },
  done: number,
  policy: MentorPolicy,
  newStartIso: string,
  now = Date.now(),
): RescheduleCheck {
  if (b.status !== 'booked') return { ok: false, reason: 'Only booked sessions can be rescheduled.' }
  const start = Date.parse(b.start)
  if (!Number.isFinite(start) || start <= now) return { ok: false, reason: 'This session has already started.' }
  if (start - now < policy.reschedule_hours * 3_600_000) return { ok: false, reason: `Sessions can be rescheduled up to ${policy.reschedule_hours} hours before they start.` }
  if (done >= policy.max_reschedules) return { ok: false, reason: policy.max_reschedules === 0 ? 'This mentor does not allow rescheduling. You can cancel within the cancellation window instead.' : `You have already rescheduled this session ${done === 1 ? 'once' : `${done} times`}.` }
  const next = Date.parse(newStartIso)
  if (!Number.isFinite(next)) return { ok: false, reason: 'Pick a new time.' }
  if (next === start) return { ok: false, reason: 'Pick a different time.' }
  return { ok: true }
}

/** Average of published review ratings, one decimal. */
export function aggregateRating(rows: { rating: number }[]): { avg: number; count: number } {
  const ok = rows.filter((r) => Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5)
  if (!ok.length) return { avg: 0, count: 0 }
  return { avg: Math.round((ok.reduce((a, r) => a + r.rating, 0) / ok.length) * 10) / 10, count: ok.length }
}

/** Admin decisions on a mentor profile. */
export type MentorAction = 'verify' | 'reject' | 'suspend' | 'reinstate'
export function nextMentorStatus(current: MentorStatus, action: MentorAction): MentorStatus | null {
  if (action === 'verify') return current === 'pending' || current === 'rejected' ? 'verified' : null
  if (action === 'reject') return current === 'pending' ? 'rejected' : null
  if (action === 'suspend') return current === 'verified' ? 'suspended' : null
  return current === 'suspended' ? 'verified' : null
}

/** Listed in the public directory only when verified, the seller is approved and there is at least one live offering. */
export function isListable(status: MentorStatus, sellerStatus: string, liveOfferings: number): boolean {
  return status === 'verified' && sellerStatus === 'approved' && liveOfferings > 0
}

export interface DirectoryQuery { q?: string; skill?: string; company?: string; type?: OfferingType; sort?: 'rating' | 'price' | 'experience' }

export function parseDirectoryQuery(sp: Record<string, string | string[] | undefined>): DirectoryQuery {
  const one = (k: string) => { const v = sp[k]; const s = Array.isArray(v) ? v[0] : v; return typeof s === 'string' ? clean(s).slice(0, 60) : '' }
  const type = one('type')
  const sort = one('sort')
  return {
    ...(one('q') ? { q: one('q') } : {}),
    ...(one('skill') ? { skill: one('skill') } : {}),
    ...(one('company') ? { company: one('company') } : {}),
    ...((OFFERING_TYPES as readonly string[]).includes(type) ? { type: type as OfferingType } : {}),
    ...(sort === 'price' || sort === 'experience' || sort === 'rating' ? { sort } : {}),
  }
}

/** Filter + sort the cached directory in memory (bounded by the number of listed mentors). */
export function filterDirectory(list: PublicMentor[], q: DirectoryQuery): PublicMentor[] {
  const has = (arr: string[], needle: string) => arr.some((x) => x.toLowerCase().includes(needle.toLowerCase()))
  let out = list.filter((m) => {
    if (q.skill && !has(m.skills, q.skill)) return false
    if (q.company && !has(m.companies, q.company)) return false
    if (q.type && !m.offerings.some((o) => o.type === q.type)) return false
    if (q.q) {
      const hay = [m.display_name, m.headline, ...m.skills, ...m.companies].join(' ').toLowerCase()
      if (!q.q.toLowerCase().split(' ').every((w) => hay.includes(w))) return false
    }
    return true
  })
  const minPrice = (m: PublicMentor) => Math.min(...m.offerings.map((o) => (o.currency === 'USD' ? o.price * 85 : o.price)), Number.MAX_SAFE_INTEGER)
  if (q.sort === 'price') out = [...out].sort((a, b) => minPrice(a) - minPrice(b))
  else if (q.sort === 'experience') out = [...out].sort((a, b) => b.experience_years - a.experience_years)
  else out = [...out].sort((a, b) => b.rating.avg * Math.min(1, b.rating.count / 3) - a.rating.avg * Math.min(1, a.rating.count / 3) || b.sessions_completed - a.sessions_completed || a.display_name.localeCompare(b.display_name))
  return out
}

export function newProfileDefaults(): Pick<MentorProfile, 'availability' | 'policy' | 'status' | 'listed'> {
  return { availability: { ...DEFAULT_AVAILABILITY, weekly: [] }, policy: { ...DEFAULT_POLICY }, status: 'pending', listed: false }
}

/** A public https link to a code repository / gist for a code review. */
export function isRepoLink(u: string): boolean {
  return /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org|gist\.github\.com)\/[\w.\-/]{2,300}$/i.test(u)
}

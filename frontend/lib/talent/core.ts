/**
 * Recruiter talent search — pure rules (tests/talent-search.test.ts).
 *
 *  - Learners are NOT discoverable unless they opt in with explicit consent;
 *    withdrawing removes them from search at once (default OFF).
 *  - Recruiters (ATS admin / recruiter / hiring manager of a tenant) search by
 *    verified skill + minimum level, location, graduation year, availability.
 *    Results carry the passport summary only — never email or phone.
 *  - Contact details are released to the inviting tenant only when the
 *    learner accepts that tenant's invite.
 */
import { z } from 'zod'
import { canonicalSkill } from '@/lib/ats/skills'
import { PASSPORT_LEVELS, type PassportLevel } from '@/lib/passport/core'

// ─── Consent ────────────────────────────────────────────────────────────────

export const CONSENT_VERSION = '2026-10-21'
export type ConsentRegime = 'dpdp' | 'gdpr' | 'general'

const GDPR_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
])

export function consentRegime(country: string | null | undefined): ConsentRegime {
  const c = String(country || '').trim().toUpperCase()
  if (c === 'IN') return 'dpdp'
  if (GDPR_COUNTRIES.has(c)) return 'gdpr'
  return 'general'
}

export interface ConsentCopy {
  regime: ConsentRegime
  title: string
  points: string[]
  checkbox: string
}

/** Wording shown next to the opt-in switch (and stored by version with the consent). */
export function consentCopy(regime: ConsentRegime): ConsentCopy {
  const common = [
    'Companies hiring on CodeSpectra can find you by your verified skills, level, city/country, graduation year and availability.',
    'They see your passport summary only — not your email or phone number.',
    'Your contact details are shared with a company only when you accept its invite.',
    'You can turn this off at any time; you disappear from search immediately. Invites you already accepted stay with that company.',
  ]
  if (regime === 'dpdp') {
    return {
      regime,
      title: 'Your consent under India’s Digital Personal Data Protection Act, 2023',
      points: [
        ...common,
        'Purpose: to let employers discover you for jobs, tests and interviews. We use this data for no other purpose under this consent.',
        'You can withdraw consent, ask for a correction or erasure, or raise a grievance from Settings or by contacting support.',
      ],
      checkbox: 'I give my free, specific and informed consent to be discoverable by employers for hiring.',
    }
  }
  if (regime === 'gdpr') {
    return {
      regime,
      title: 'Your consent under the GDPR',
      points: [
        ...common,
        'Legal basis: your consent (Art. 6(1)(a) GDPR). Withdrawing it does not affect anything done before.',
        'You have the right to access, correct, erase or port your data and to complain to your data protection authority.',
      ],
      checkbox: 'I consent to being discoverable by employers for hiring purposes.',
    }
  }
  return { regime, title: 'Be discoverable by employers', points: common, checkbox: 'I agree to be discoverable by employers for hiring.' }
}

// ─── Talent profile input ───────────────────────────────────────────────────

export const AVAILABILITY = ['immediately', 'within_1_month', 'within_3_months', 'not_looking'] as const
export type Availability = (typeof AVAILABILITY)[number]
export const AVAILABILITY_LABELS: Record<Availability, string> = {
  immediately: 'Available now',
  within_1_month: 'Within a month',
  within_3_months: 'Within three months',
  not_looking: 'Not looking right now',
}

const thisYear = () => new Date().getUTCFullYear()

export const talentProfileSchema = z.object({
  discoverable: z.boolean(),
  /** Must be true to turn discoverability on. */
  consent: z.boolean().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase()).nullable().optional(),
  graduation_year: z.number().int().min(1970).max(thisYear() + 8).nullable().optional(),
  availability: z.enum(AVAILABILITY).nullable().optional(),
}).strict()
export type TalentProfileInput = z.infer<typeof talentProfileSchema>

// ─── Search ─────────────────────────────────────────────────────────────────

export const talentSearchSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(40)).max(5).default([]),
  min_level: z.enum(PASSPORT_LEVELS).default('beginner'),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase()).optional(),
  city: z.string().trim().max(80).optional(),
  graduation_year_min: z.number().int().min(1970).max(2100).optional(),
  graduation_year_max: z.number().int().min(1970).max(2100).optional(),
  availability: z.array(z.enum(AVAILABILITY)).max(4).optional(),
  page: z.number().int().min(1).max(50).default(1),
  limit: z.number().int().min(1).max(50).default(20),
}).strict()
export type TalentSearchInput = z.infer<typeof talentSearchSchema>

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Mongo filter over skill_passports. Always: discoverable, not private,
 * consented, not blocked by this tenant's learner block list.
 */
export function buildSearchFilter(q: TalentSearchInput, tenantId: string): Record<string, unknown> {
  const rank = PASSPORT_LEVELS.indexOf(q.min_level as PassportLevel)
  const and: Record<string, unknown>[] = [
    { 'talent.discoverable': true },
    { 'talent.consent.at': { $type: 'string' } },
    { visibility: { $ne: 'private' } },
    { 'talent.blocked_tenants': { $ne: tenantId } },
  ]
  for (const s of [...new Set(q.skills.map((x) => canonicalSkill(x)))]) {
    and.push({ skills_index: { $elemMatch: { skill: s, rank: { $gte: rank } } } })
  }
  if (!q.skills.length && rank > 0) and.push({ 'skills_index.rank': { $gte: rank } })
  if (q.country) and.push({ 'talent.country': q.country })
  if (q.city) and.push({ 'talent.city': { $regex: `^${escapeRe(q.city)}$`, $options: 'i' } })
  if (q.graduation_year_min || q.graduation_year_max) {
    and.push({ 'talent.graduation_year': { ...(q.graduation_year_min ? { $gte: q.graduation_year_min } : {}), ...(q.graduation_year_max ? { $lte: q.graduation_year_max } : {}) } })
  }
  if (q.availability?.length) and.push({ 'talent.availability': { $in: q.availability } })
  return { $and: and }
}

export interface TalentResult {
  /** Opaque per-learner reference (the passport handle). */
  handle: string
  name: string
  city: string | null
  country: string | null
  graduation_year: number | null
  availability: string | null
  /** Matched skills first, then the strongest others. */
  skills: Array<{ skill: string; level: string; score: number }>
  match: number
  updated_at: string | null
}

/** Shape one passport doc for a recruiter — summary only, never contact fields. Pure. */
export function toTalentResult(doc: Record<string, any>, wanted: string[]): TalentResult {
  const want = new Set(wanted.map((w) => canonicalSkill(w)))
  const idx = (Array.isArray(doc.skills_index) ? doc.skills_index : []) as Array<{ skill: string; level: string; rank: number; score: number }>
  const matched = idx.filter((s) => want.has(s.skill))
  const others = idx.filter((s) => !want.has(s.skill)).sort((a, b) => b.rank - a.rank || b.score - a.score)
  const t = doc.talent || {}
  const match = matched.length ? Math.round(matched.reduce((a, s) => a + s.score * (1 + s.rank / 3), 0) / matched.length) : Math.round(others.slice(0, 3).reduce((a, s) => a + s.score, 0) / Math.max(1, Math.min(3, others.length)))
  return {
    handle: String(doc.handle),
    name: String(doc.display_name || 'Learner'),
    city: t.city ?? null,
    country: t.country ?? null,
    graduation_year: typeof t.graduation_year === 'number' ? t.graduation_year : null,
    availability: t.availability ?? null,
    skills: [...matched, ...others].slice(0, 8).map((s) => ({ skill: s.skill, level: s.level, score: s.score })),
    match,
    updated_at: doc.computed_at ?? null,
  }
}

export function rankResults(rows: TalentResult[]): TalentResult[] {
  return [...rows].sort((a, b) => b.match - a.match || String(b.updated_at).localeCompare(String(a.updated_at)) || a.handle.localeCompare(b.handle))
}

// ─── Invites ────────────────────────────────────────────────────────────────

export const INVITE_TARGETS = ['test', 'job', 'interview'] as const
export type InviteTarget = (typeof INVITE_TARGETS)[number]
export const INVITE_TARGET_LABELS: Record<InviteTarget, string> = { test: 'Take a test', job: 'Apply to a job', interview: 'Interview' }
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'
export const INVITE_TTL_DAYS = 14

export const sendInviteSchema = z.object({
  handle: z.string().trim().min(3).max(30),
  target_type: z.enum(INVITE_TARGETS),
  /** Exam id (test) or ATS job id (job, interview). */
  target_id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/),
  message: z.string().trim().max(1000).optional(),
}).strict()
export type SendInviteInput = z.infer<typeof sendInviteSchema>

export const respondSchema = z.object({ action: z.enum(['accept', 'decline']) }).strict()

/** May the learner answer this invite now? Pure. */
export function canRespond(inv: { status: InviteStatus; expires_at: string; learner_id: string }, userId: string, now = Date.now()): { ok: true } | { ok: false; status: number; error: string } {
  if (inv.learner_id !== userId) return { ok: false, status: 404, error: 'Invite not found' }
  if (inv.status !== 'pending') return { ok: false, status: 409, error: 'You already answered this invite.' }
  if (Date.parse(inv.expires_at) < now) return { ok: false, status: 410, error: 'This invite has expired.' }
  return { ok: true }
}

/** Contact fields a recruiter may see for one invite. Pure. */
export function contactFor(inv: { status: InviteStatus }, learner: { email?: string | null; phone?: string | null }): { email: string | null; phone: string | null } | null {
  if (inv.status !== 'accepted') return null
  return { email: learner.email ?? null, phone: learner.phone ?? null }
}

// ─── Settings + quota ───────────────────────────────────────────────────────

export interface TalentSettings {
  enabled: boolean
  monthly_invites_per_tenant: number
  searches_per_hour_per_user: number
  invites_per_day_per_user: number
}
export const DEFAULT_TALENT_SETTINGS: TalentSettings = {
  enabled: true,
  monthly_invites_per_tenant: 100,
  searches_per_hour_per_user: 60,
  invites_per_day_per_user: 30,
}

export const talentSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  monthly_invites_per_tenant: z.number().int().min(0).max(100_000).optional(),
  searches_per_hour_per_user: z.number().int().min(1).max(10_000).optional(),
  invites_per_day_per_user: z.number().int().min(1).max(10_000).optional(),
}).strict()

export function normalizeTalentSettings(raw: unknown): TalentSettings {
  const p = talentSettingsSchema.partial().safeParse(raw && typeof raw === 'object' ? Object.fromEntries(Object.entries(raw).filter(([k]) => k in DEFAULT_TALENT_SETTINGS)) : {})
  return { ...DEFAULT_TALENT_SETTINGS, ...(p.success ? p.data : {}) }
}

/** UTC month key, e.g. "2026-10". */
export function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7)
}

export const REPORT_REASONS = ['spam', 'harassment', 'fake_company', 'discrimination', 'other'] as const
export const reportSchema = z.object({
  tenant_id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/),
  block: z.boolean().default(true),
  report: z.boolean().default(false),
  reason: z.enum(REPORT_REASONS).optional(),
  details: z.string().trim().max(1000).optional(),
  invite_id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
}).strict()

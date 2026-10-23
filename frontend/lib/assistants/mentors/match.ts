/**
 * Mentor matching (pure, tested in tests/assistants-mentor-match.test.ts).
 * Learner signals come from their study plan (weak areas, target company) and
 * profile (interface language, time zone); mentors are the public directory
 * (verified, listed, live offerings only). Deterministic — no model calls.
 *
 *   skills overlap with weak areas  ≤ 45
 *   target company in mentor's companies  15
 *   shared language  15 (English fallback 8)
 *   time-zone gap ≤ 3 h → 10, ≤ 6 h → 5
 *   rating (shrunk towards 3.5 with few reviews)  ≤ 10
 *   experience  ≤ 5
 */
import type { OfferingType, PublicMentor } from '@/lib/mentors/types'

export interface LearnerProfile {
  weak_areas: { label: string; domain: string }[]
  target: string | null
  /** ISO 639-1 of the interface language ('en' | 'hi' | 'te'). */
  language: string
  timezone: string | null
}

export interface MentorMatch {
  slug: string
  display_name: string
  headline: string
  score: number
  reasons: MatchReason[]
  /** Best-fit session type and its cheapest offering. */
  offering: { type: OfferingType; title: string; product_slug: string; price: number; currency: 'INR' | 'USD'; duration_min: number } | null
  rating: { avg: number; count: number }
  avatar_url: string | null
}

export type MatchReason =
  | { kind: 'skill'; value: string }
  | { kind: 'company'; value: string }
  | { kind: 'language'; value: string }
  | { kind: 'timezone' }
  | { kind: 'rating'; value: number }

const LANG_NAMES: Record<string, string[]> = { en: ['english'], hi: ['hindi', 'हिन्दी', 'हिंदी'], te: ['telugu', 'తెలుగు'] }
const STOP = new Set(['and', 'the', 'of', 'for', 'to', 'in', 'a', 'an', 'with', 'skills', 'basics', 'advanced'])

export const tokens = (s: string): string[] => s.toLowerCase().replace(/[^\p{L}\p{N}+#.\s]/gu, ' ').split(/\s+/).map((w) => w.replace(/\.+$/, '')).filter((w) => w.length > 1 && !STOP.has(w))

/** Offset of an IANA zone in minutes at `at` (null when unknown). Pure. */
export function tzOffsetMinutes(tz: string | null | undefined, at = new Date()): number | null {
  if (!tz) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at)
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const local = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
    return Math.round((local - Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes())) / 60_000)
  } catch {
    return null
  }
}

/** Session type that fits the learner's top weak area. Pure. */
export function suggestedType(l: Pick<LearnerProfile, 'weak_areas'>): OfferingType {
  const top = l.weak_areas[0]
  if (!top) return 'career_guidance'
  if (top.domain === 'interview' || /interview|communication|hr/i.test(top.label)) return 'mock_interview'
  if (/dsa|coding|algorithm|program|data structure|sql|java|python|c\+\+|javascript|web|backend|frontend/i.test(`${top.domain} ${top.label}`)) return 'code_review'
  return 'career_guidance'
}

export function scoreMentor(m: PublicMentor, l: LearnerProfile, now = new Date()): { score: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = []
  const mentorWords = new Set([...m.skills.flatMap(tokens), ...tokens(m.headline)])
  let skill = 0
  for (const [i, a] of l.weak_areas.slice(0, 5).entries()) {
    const hit = [...tokens(a.label), ...tokens(a.domain.replace(/_/g, ' '))].find((w) => mentorWords.has(w))
    if (hit) {
      skill += i === 0 ? 20 : 10
      if (reasons.filter((r) => r.kind === 'skill').length < 2) reasons.push({ kind: 'skill', value: a.label })
    }
  }
  let score = Math.min(45, skill)
  if (l.target) {
    const t = tokens(l.target)
    const c = m.companies.find((co) => tokens(co).some((w) => t.includes(w)))
    if (c) { score += 15; reasons.push({ kind: 'company', value: c }) }
  }
  const langs = m.languages.map((x) => x.toLowerCase())
  const want = LANG_NAMES[l.language] ?? []
  const shared = langs.find((x) => want.some((w) => x.includes(w)) || x === l.language)
  if (shared) { score += 15; if (l.language !== 'en') reasons.push({ kind: 'language', value: shared }) }
  else if (langs.some((x) => x.includes('english') || x === 'en')) score += 8
  const a = tzOffsetMinutes(l.timezone, now), b = tzOffsetMinutes(m.timezone, now)
  if (a !== null && b !== null) {
    const gap = Math.abs(a - b) / 60
    if (gap <= 3) { score += 10; reasons.push({ kind: 'timezone' }) } else if (gap <= 6) score += 5
  }
  const n = m.rating.count
  const shrunk = n > 0 ? (m.rating.avg * n + 3.5 * 3) / (n + 3) : 3.5
  score += Math.max(0, Math.min(10, ((shrunk - 2.5) / 2.5) * 10))
  if (n >= 3 && m.rating.avg >= 4.5) reasons.push({ kind: 'rating', value: Math.round(m.rating.avg * 10) / 10 })
  score += Math.min(5, Math.max(0, m.experience_years) / 2)
  return { score: Math.round(score * 10) / 10, reasons }
}

/** Top mentors for a learner (a mentor with no skill, company or language fit is left out). Pure. */
export function matchMentors(mentors: readonly PublicMentor[], l: LearnerProfile, opts: { limit?: number; now?: Date } = {}): MentorMatch[] {
  const type = suggestedType(l)
  return mentors
    .map((m) => ({ m, ...scoreMentor(m, l, opts.now) }))
    .filter((x) => x.reasons.some((r) => r.kind === 'skill' || r.kind === 'company' || r.kind === 'language'))
    .sort((a, b) => b.score - a.score || b.m.rating.count - a.m.rating.count || a.m.display_name.localeCompare(b.m.display_name))
    .slice(0, Math.max(1, Math.min(10, opts.limit ?? 3)))
    .map(({ m, score, reasons }) => {
      const pool = m.offerings.filter((o) => o.type === type)
      const off = (pool.length ? pool : m.offerings).slice().sort((a, b) => a.price - b.price)[0]
      return {
        slug: m.slug, display_name: m.display_name, headline: m.headline, score, reasons, rating: m.rating, avatar_url: m.avatar_url ?? null,
        offering: off ? { type: off.type, title: off.title, product_slug: off.slug, price: off.price, currency: off.currency, duration_min: off.duration_min } : null,
      }
    })
}

/** A mentor session that ended 1–72 h ago gets one follow-up. Pure. */
export function followUpDue(b: { status: string; end: string }, now = new Date()): boolean {
  if (b.status !== 'booked' && b.status !== 'completed') return false
  const end = Date.parse(b.end)
  if (!Number.isFinite(end)) return false
  const ago = now.getTime() - end
  return ago >= 3_600_000 && ago <= 72 * 3_600_000
}

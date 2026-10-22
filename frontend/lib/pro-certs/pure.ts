/**
 * Proctored certifications — pure rules (tests/pro-certs.test.ts).
 *
 *  - selectQuestions: per-candidate randomised draw from the approved bank
 *    with exposure control (least-used questions are favoured, over-exposed
 *    ones are capped) and no repeats of questions this candidate already saw.
 *  - attemptEligibility: cooldown after a failed attempt, attempts per
 *    rolling year, one open attempt at a time, renewal window for holders.
 *  - decideOutcome: score vs pass mark, integrity trust vs threshold, and the
 *    program's human-review policy.
 *  - credential ids, expiry and the LinkedIn "add to profile" link.
 */
import type { AttemptStatus, BlueprintSection, CertCurrency, DifficultyMix, ProgramDoc, PublicProgram, ReviewPolicy } from './types'

const DAY = 86_400_000

// ─── Seeded randomness ───────────────────────────────────────────────────────

/** 32-bit FNV-1a of a string (seed material). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: small, fast, deterministic PRNG in [0, 1). */
export function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Question selection with exposure control ────────────────────────────────

export interface PoolItem {
  id: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  /** Times this question was drawn for this program so far. */
  exposure: number
}

export interface SelectOptions {
  /** Seed (e.g. attempt id): same seed + same pool → same draw. */
  seed: string
  /** Question ids this candidate saw on earlier attempts. */
  seen?: ReadonlySet<string>
  /**
   * Over-exposure cap: questions drawn more than `cap` times (relative to the
   * least-used question in the bucket: min + cap) are skipped while enough
   * others remain. Default 25.
   */
  exposureCap?: number
}

export interface SelectResult {
  ids: string[]
  /** Per difficulty: how many could not be filled from that difficulty (topped up from neighbours). */
  shortfall: DifficultyMix
  /** Questions missing even after topping up (pool too small). */
  missing: number
  /** Questions repeated from the candidate's earlier attempts (only when the pool ran out). */
  repeated: number
}

const DIFFS = ['Easy', 'Medium', 'Hard'] as const
const NEIGHBOURS: Record<(typeof DIFFS)[number], Array<(typeof DIFFS)[number]>> = {
  Easy: ['Medium', 'Hard'],
  Medium: ['Easy', 'Hard'],
  Hard: ['Medium', 'Easy'],
}

/**
 * Weighted sampling without replacement (Efraimidis–Spirakis): key = u^(1/w),
 * w = 1 / (1 + exposure)². Least-used questions are much more likely, but
 * every eligible question can still appear, so two candidates rarely share a
 * paper and no question is burned through quickly.
 */
function weightedPick(items: PoolItem[], k: number, rand: () => number): PoolItem[] {
  if (k <= 0 || !items.length) return []
  const keyed = items.map((it) => {
    const w = 1 / Math.pow(1 + Math.max(0, it.exposure), 2)
    const u = Math.max(rand(), 1e-12)
    return { it, key: Math.pow(u, 1 / w) }
  })
  keyed.sort((a, b) => b.key - a.key || (a.it.id < b.it.id ? -1 : 1))
  return keyed.slice(0, k).map((x) => x.it)
}

function capped(items: PoolItem[], want: number, cap: number): PoolItem[] {
  if (!items.length) return items
  const min = Math.min(...items.map((i) => i.exposure))
  const ok = items.filter((i) => i.exposure <= min + cap)
  return ok.length >= want ? ok : items
}

export function selectQuestions(pool: readonly PoolItem[], mix: DifficultyMix, opts: SelectOptions): SelectResult {
  const rand = prng(hashSeed(opts.seed))
  const seen = opts.seen ?? new Set<string>()
  const cap = Math.max(1, opts.exposureCap ?? 25)
  // Deduplicate the pool and sort by id so the draw does not depend on DB order.
  const uniq = [...new Map(pool.map((p) => [p.id, p])).values()].sort((a, b) => (a.id < b.id ? -1 : 1))
  const taken = new Set<string>()
  const fresh = (d: string) => uniq.filter((p) => p.difficulty === d && !seen.has(p.id) && !taken.has(p.id))
  const out: PoolItem[] = []
  const shortfall: DifficultyMix = { Easy: 0, Medium: 0, Hard: 0 }
  let need = 0

  for (const d of DIFFS) {
    const want = Math.max(0, Math.floor(mix[d] || 0))
    const picked = weightedPick(capped(fresh(d), want, cap), want, rand)
    picked.forEach((p) => taken.add(p.id))
    out.push(...picked)
    shortfall[d] = want - picked.length
  }
  // Top up from neighbouring difficulties (still unseen questions only).
  for (const d of DIFFS) {
    let left = shortfall[d]
    for (const n of NEIGHBOURS[d]) {
      if (left <= 0) break
      const picked = weightedPick(capped(fresh(n), left, cap), left, rand)
      picked.forEach((p) => taken.add(p.id))
      out.push(...picked)
      left -= picked.length
    }
    need += left
  }
  // Last resort: repeat questions from earlier attempts rather than ship a short paper.
  let repeated = 0
  if (need > 0) {
    const old = uniq.filter((p) => seen.has(p.id) && !taken.has(p.id))
    const picked = weightedPick(old, need, rand)
    picked.forEach((p) => taken.add(p.id))
    out.push(...picked)
    repeated = picked.length
    need -= picked.length
  }
  return { ids: shuffle(out.map((p) => p.id), rand), shortfall, missing: need, repeated }
}

export function sectionQuestionCount(s: Pick<BlueprintSection, 'difficulty'>): number {
  return s.difficulty.Easy + s.difficulty.Medium + s.difficulty.Hard
}

// ─── Attempt policy ──────────────────────────────────────────────────────────

export interface PriorAttempt {
  status: AttemptStatus
  created_at: string
  decided_at: string | null
}

export interface HeldCredential {
  id: string
  status: 'active' | 'renewed' | 'revoked'
  expires_at: string
}

export type Eligibility =
  | { ok: true; renewal: string | null }
  | { ok: false; reason: 'open_attempt' | 'cooldown' | 'yearly_limit' | 'already_certified' | 'not_published' | 'no_price'; retry_at: string | null }

export function attemptEligibility(input: {
  program: Pick<ProgramDoc, 'status' | 'attempts' | 'renewal_window_days'>
  attempts: readonly PriorAttempt[]
  credential: HeldCredential | null
  now?: Date
}): Eligibility {
  const now = (input.now ?? new Date()).getTime()
  if (input.program.status !== 'published') return { ok: false, reason: 'not_published', retry_at: null }
  if (input.attempts.some((a) => a.status === 'ready' || a.status === 'in_review')) return { ok: false, reason: 'open_attempt', retry_at: null }

  let renewal: string | null = null
  const cred = input.credential
  if (cred && cred.status === 'active') {
    const exp = Date.parse(cred.expires_at)
    const opensAt = exp - input.program.renewal_window_days * DAY
    if (now < opensAt) return { ok: false, reason: 'already_certified', retry_at: new Date(opensAt).toISOString() }
    renewal = cred.id
  }

  // Attempts in the last 365 days (voided attempts — e.g. a refunded order — don't count).
  const counted = input.attempts.filter((a) => a.status !== 'void').map((a) => Date.parse(a.created_at)).filter((t) => Number.isFinite(t) && t > now - 365 * DAY).sort((a, b) => a - b)
  if (counted.length >= input.program.attempts.max_per_year) {
    return { ok: false, reason: 'yearly_limit', retry_at: new Date(counted[counted.length - input.program.attempts.max_per_year] + 365 * DAY).toISOString() }
  }
  const lastFail = input.attempts
    .filter((a) => a.status === 'failed' || a.status === 'rejected')
    .map((a) => Date.parse(a.decided_at || a.created_at))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]
  if (lastFail !== undefined && input.program.attempts.cooldown_days > 0) {
    const until = lastFail + input.program.attempts.cooldown_days * DAY
    if (now < until) return { ok: false, reason: 'cooldown', retry_at: new Date(until).toISOString() }
  }
  return { ok: true, renewal }
}

// ─── Outcome ─────────────────────────────────────────────────────────────────

export type Outcome = { decision: 'failed' | 'review' | 'issue'; flags: string[] }

/**
 * A failing score fails (no review needed). A pass is issued straight away
 * only when the policy is `below_threshold` AND trust is known and at or above
 * the threshold; anything else waits for a reviewer. Low trust is flagged.
 */
export function decideOutcome(i: { scorePct: number; passPercent: number; trust: number | null; minTrust: number; review: ReviewPolicy; identityFlagged?: boolean }): Outcome {
  const flags: string[] = []
  if (i.trust === null) flags.push('no_integrity_data')
  else if (i.trust < i.minTrust) flags.push('low_trust')
  if (i.identityFlagged) flags.push('identity_review')
  if (i.scorePct < i.passPercent) return { decision: 'failed', flags }
  if (i.review === 'below_threshold' && flags.length === 0) return { decision: 'issue', flags }
  return { decision: 'review', flags }
}

export function scorePercent(score: unknown, max: unknown): number {
  const s = Number(score), m = Number(max)
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((s / m) * 1000) / 10))
}

// ─── Credentials ─────────────────────────────────────────────────────────────

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1

/** "CSC-XXXX-XXXX-XXXX-XXXX" from 20 random bytes' worth of symbols (≈100 bits). */
export function credentialIdFrom(bytes: Uint8Array): string {
  const chars: string[] = []
  for (let i = 0; i < 20; i++) chars.push(B32[(bytes[i % bytes.length] ?? 0) % 32])
  return `CSC-${chars.slice(0, 5).join('')}-${chars.slice(5, 10).join('')}-${chars.slice(10, 15).join('')}-${chars.slice(15, 20).join('')}`
}

export function isProCredentialId(v: unknown): v is string {
  return typeof v === 'string' && /^CSC-[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/.test(v)
}

/** Same day-of-month `months` later (clamped to the month's last day), UTC. */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso)
  const day = d.getUTCDate()
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(day, last))
  return t.toISOString()
}

/**
 * Renewal keeps continuity: a credential renewed before it lapses runs from
 * the old expiry; one renewed after it lapsed runs from today.
 */
export function renewedExpiry(oldExpiresAt: string | null, issuedAt: string, months: number): string {
  if (oldExpiresAt && Date.parse(oldExpiresAt) > Date.parse(issuedAt)) return addMonths(oldExpiresAt, months)
  return addMonths(issuedAt, months)
}

export type CredentialState = 'valid' | 'expired' | 'revoked' | 'renewed'

export function credentialState(c: { status: 'active' | 'renewed' | 'revoked'; expires_at: string }, now = new Date()): CredentialState {
  if (c.status === 'revoked') return 'revoked'
  if (c.status === 'renewed') return 'renewed'
  return Date.parse(c.expires_at) > now.getTime() ? 'valid' : 'expired'
}

/** LinkedIn "Add to profile" (Licenses & certifications) link. */
export function linkedInAddUrl(c: { title: string; issuedAt: string; expiresAt: string | null; credentialId: string; verifyUrl: string; organizationName?: string; organizationId?: string | null }): string {
  const issued = new Date(c.issuedAt)
  const p = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: c.title,
    issueYear: String(issued.getUTCFullYear()),
    issueMonth: String(issued.getUTCMonth() + 1),
    certUrl: c.verifyUrl,
    certId: c.credentialId,
  })
  if (c.organizationId) p.set('organizationId', c.organizationId)
  else p.set('organizationName', c.organizationName || 'CodeSpectra')
  if (c.expiresAt) {
    const e = new Date(c.expiresAt)
    p.set('expirationYear', String(e.getUTCFullYear()))
    p.set('expirationMonth', String(e.getUTCMonth() + 1))
  }
  return `https://www.linkedin.com/profile/add?${p.toString()}`
}

// ─── Catalog view ────────────────────────────────────────────────────────────

export function publicProgram(p: ProgramDoc): PublicProgram {
  const sections = p.blueprint.sections.map((s) => ({ name: s.name, questions: sectionQuestionCount(s) }))
  return {
    id: p.id, slug: p.slug, title: p.title, summary: p.summary, description: p.description, level: p.level, skills: p.skills,
    questions: sections.reduce((n, s) => n + s.questions, 0), sections,
    duration_min: p.blueprint.duration_min, pass_percent: p.blueprint.pass_percent, validity_months: p.validity_months,
    price: { INR: p.price.INR ?? null, USD: p.price.USD ?? null },
    attempts: { cooldown_days: p.attempts.cooldown_days, max_per_year: p.attempts.max_per_year },
    updated_at: p.updated_at,
  }
}

/** Price of one attempt in `currency`, or null when the program isn't sold in it. */
export function priceFor(p: Pick<ProgramDoc, 'price'>, currency: CertCurrency): number | null {
  const v = p.price[currency]
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

/** Publishing checks beyond the schema: at least one currency, section minutes fit, questions to draw. */
export function publishProblems(p: Pick<ProgramDoc, 'price' | 'blueprint'>): string[] {
  const out: string[] = []
  if (priceFor(p, 'INR') === null && priceFor(p, 'USD') === null) out.push('price_missing')
  const timed = p.blueprint.sections.reduce((n, s) => n + (s.minutes ?? 0), 0)
  if (timed > p.blueprint.duration_min) out.push('section_minutes_exceed_duration')
  if (p.blueprint.sections.some((s) => sectionQuestionCount(s) === 0)) out.push('empty_section')
  const ids = p.blueprint.sections.map((s) => s.id)
  if (new Set(ids).size !== ids.length) out.push('duplicate_section_id')
  return out
}

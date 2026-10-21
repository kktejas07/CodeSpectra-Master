/**
 * Skill passport — pure rules (tests/skill-passport.test.ts).
 *
 * A passport is a per-learner skills profile built ONLY from evidence the
 * platform itself recorded and graded: released assessment scores (proctored
 * attempts count more, a low integrity/trust score counts less or not at all),
 * company-test practice, contest / codeathon / hackathon placements, courses
 * completed, certificates, adaptive-test results and interview-sim reports.
 * Skills the learner typed into their profile are carried separately as
 * "self-reported" and never change a level.
 *
 * Per skill: every evidence row gets a weight (kind × proctoring × trust ×
 * recency half-life) and a 0–100 score; the skill score is the weighted mean
 * and the level needs both a score AND enough evidence weight (so one lucky
 * practice test can't make anyone an expert). Expert also needs at least one
 * proctored, identity-checked result.
 *
 * ponytail: a transparent weighted mean, not IRT. Weights live in KIND_WEIGHT
 * and LEVEL_RULES so they can be tuned without touching callers.
 */
import { canonicalSkill, dictionarySkillsIn, normSkill } from '@/lib/ats/skills'

export const PASSPORT_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const
export type PassportLevel = (typeof PASSPORT_LEVELS)[number]

export const LEVEL_LABELS: Record<PassportLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

export type EvidenceKind =
  | 'assessment'
  | 'adaptive'
  | 'company_test'
  | 'contest'
  | 'codeathon'
  | 'hackathon'
  | 'course'
  | 'certificate'
  | 'interview_sim'

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  assessment: 'Assessment',
  adaptive: 'Adaptive test',
  company_test: 'Company test practice',
  contest: 'Contest placement',
  codeathon: 'Codeathon placement',
  hackathon: 'Hackathon placement',
  course: 'Course completed',
  certificate: 'Certificate',
  interview_sim: 'Interview simulation',
}

/** One verified, platform-recorded result. */
export interface Evidence {
  /** Stable id: `<kind>:<source id>` (used for show/hide choices). */
  id: string
  kind: EvidenceKind
  title: string
  /** Canonical skill names this result is evidence for. */
  skills: string[]
  /** Normalised 0–100. */
  score: number
  /** ISO time the result was recorded. */
  at: string
  /** Proctored with an identity check that did not need manual review. */
  proctored?: boolean
  /** 0–100 integrity / trust score when the source has one. */
  trust?: number | null
  rank?: number | null
  participants?: number | null
  /** Learner-facing link (their own result page). */
  link?: string | null
  /** Link anyone may open (public certificate / event page), when there is one. */
  publicLink?: string | null
  /** Run by a company for hiring: hidden on the public passport unless the learner shows it. */
  privateByDefault?: boolean
}

export interface SkillEvidenceRef {
  id: string
  kind: EvidenceKind
  title: string
  score: number
  at: string
  weight: number
  proctored: boolean
  link: string | null
  publicLink: string | null
}

export interface SkillResult {
  skill: string
  level: PassportLevel
  /** Weighted mean score 0–100 (rounded). */
  score: number
  /** Sum of decayed weights — how much evidence backs the level. */
  confidence: number
  evidenceCount: number
  proctoredCount: number
  lastEvidenceAt: string
  /** Newest evidence is older than STALE_AFTER_DAYS. */
  stale: boolean
  evidence: SkillEvidenceRef[]
}

export interface PassportSummary {
  skills: SkillResult[]
  /** Evidence rows excluded (low trust) — shown to the learner only. */
  excluded: Array<{ id: string; title: string; reason: string }>
  selfReported: string[]
  computedAt: string
}

// ─── Weights ────────────────────────────────────────────────────────────────

export const KIND_WEIGHT: Record<EvidenceKind, number> = {
  assessment: 0.7, // ×PROCTORED_BONUS when proctored
  adaptive: 0.8,
  company_test: 0.5,
  contest: 0.8,
  codeathon: 0.8,
  hackathon: 0.7,
  course: 0.35,
  certificate: 0.5,
  interview_sim: 0.35,
}
export const PROCTORED_BONUS = 1.5
/** Evidence half-life: a result counts half as much after this many days. */
export const HALF_LIFE_DAYS = 365
export const STALE_AFTER_DAYS = 540
/** Trust below this: the result is not counted at all. */
export const MIN_TRUST = 40

/** Minimum score AND minimum evidence weight per level (checked top-down). */
export const LEVEL_RULES: Array<{ level: PassportLevel; minScore: number; minConfidence: number; needsProctored?: boolean }> = [
  { level: 'expert', minScore: 85, minConfidence: 2.4, needsProctored: true },
  { level: 'advanced', minScore: 70, minConfidence: 1.4 },
  { level: 'intermediate', minScore: 50, minConfidence: 0.6 },
]

const DAY_MS = 86_400_000

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Recency factor in (0, 1]: 0.5 ^ (age / half-life). Future dates count as now. */
export function recencyFactor(at: string, now: Date, halfLifeDays = HALF_LIFE_DAYS): number {
  const t = Date.parse(at)
  if (!Number.isFinite(t)) return 0
  const ageDays = Math.max(0, (now.getTime() - t) / DAY_MS)
  return Math.pow(0.5, ageDays / halfLifeDays)
}

/** Trust multiplier; null when the result must not count. Unknown trust = 1. */
export function trustFactor(trust: number | null | undefined): number | null {
  if (typeof trust !== 'number' || !Number.isFinite(trust)) return 1
  if (trust < MIN_TRUST) return null
  return clamp(trust / 100, 0.5, 1)
}

/** Weight of one evidence row at `now` (0 = does not count). */
export function evidenceWeight(e: Evidence, now: Date): number {
  const tf = trustFactor(e.trust)
  if (tf === null) return 0
  const base = KIND_WEIGHT[e.kind] * (e.proctored ? PROCTORED_BONUS : 1)
  return base * tf * recencyFactor(e.at, now)
}

/** Placement → 0–100: share of the field you beat. Rank only: podium scores. */
export function placementScore(rank: number | null | undefined, participants: number | null | undefined): number {
  if (typeof rank !== 'number' || !Number.isFinite(rank) || rank < 1) return 0
  if (typeof participants === 'number' && participants >= 2 && rank <= participants) {
    return Math.round(100 * (1 - (rank - 1) / participants))
  }
  return rank === 1 ? 95 : rank === 2 ? 90 : rank === 3 ? 85 : rank <= 10 ? 75 : 60
}

export function levelFor(score: number, confidence: number, proctoredCount: number): PassportLevel {
  for (const r of LEVEL_RULES) {
    if (score >= r.minScore && confidence >= r.minConfidence && (!r.needsProctored || proctoredCount > 0)) return r.level
  }
  return 'beginner'
}

// ─── Skill names ────────────────────────────────────────────────────────────

/** Section / subject words that map to a broad skill when no dictionary skill is named. */
const BROAD: Array<[RegExp, string]> = [
  [/\b(quant|quantitative|numerical|arithmetic|aptitude|maths?|mathematics)\b/i, 'aptitude'],
  [/\b(logical|reasoning|puzzles?)\b/i, 'logical reasoning'],
  [/\b(verbal|english|reading|grammar|comprehension)\b/i, 'verbal ability'],
  [/\b(dsa|data structures?|algorithms?)\b/i, 'data structures and algorithms'],
  [/\b(coding|programming|problem solving)\b/i, 'problem solving'],
  [/\b(system design)\b/i, 'system design'],
  [/\b(sql|database|dbms)\b/i, 'sql'],
  [/\b(cad|solidworks|autocad|catia|creo)\b/i, 'cad'],
  [/\b(testing|qa|quality assurance)\b/i, 'software testing'],
  [/\b(networking|computer networks?)\b/i, 'computer networks'],
  [/\b(operating systems?|os)\b/i, 'operating systems'],
]

/**
 * Canonical skills named in a title / subject / section name. Dictionary
 * skills first (lib/ats/skills), then broad buckets; `fallback` when nothing
 * matched (e.g. 'problem solving' for a codeathon).
 */
export function skillsFromText(text: string | null | undefined, fallback?: string): string[] {
  const t = String(text || '').slice(0, 400)
  const out = new Set<string>(dictionarySkillsIn(t))
  for (const [re, skill] of BROAD) if (re.test(t)) out.add(skill)
  if (!out.size && fallback) out.add(fallback)
  return [...out].slice(0, 6)
}

/** Free-text profile skills ("React, node js; SQL") → canonical, de-duplicated list. */
export function parseSelfReported(raw: unknown, max = 30): string[] {
  const parts = Array.isArray(raw)
    ? raw.map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x && 'name' in x ? String((x as { name: unknown }).name) : ''))
    : String(raw ?? '').split(/[,;\n|•]+/)
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const n = normSkill(p).replace(/[^a-z0-9+#. /-]/g, '').trim()
    if (n.length < 1 || n.length > 40) continue
    const c = canonicalSkill(n)
    if (seen.has(c)) continue
    seen.add(c)
    out.push(c)
    if (out.length >= max) break
  }
  return out
}

// ─── Compute ────────────────────────────────────────────────────────────────

/** Build the passport from verified evidence. Pure and deterministic for a given `now`. */
export function computePassport(evidence: readonly Evidence[], selfReported: readonly string[], now = new Date()): PassportSummary {
  const bySkill = new Map<string, { w: number; ws: number; refs: SkillEvidenceRef[]; proctored: number; last: number }>()
  const excluded: PassportSummary['excluded'] = []
  for (const e of evidence) {
    if (trustFactor(e.trust) === null) {
      excluded.push({ id: e.id, title: e.title, reason: 'Integrity score too low to count' })
      continue
    }
    const w = evidenceWeight(e, now)
    if (!(w > 0)) continue
    const score = clamp(Number(e.score) || 0, 0, 100)
    const skills = [...new Set(e.skills.map((s) => canonicalSkill(s)).filter(Boolean))]
    for (const s of skills) {
      const cur = bySkill.get(s) ?? { w: 0, ws: 0, refs: [], proctored: 0, last: 0 }
      cur.w += w
      cur.ws += w * score
      if (e.proctored) cur.proctored++
      cur.last = Math.max(cur.last, Date.parse(e.at) || 0)
      cur.refs.push({ id: e.id, kind: e.kind, title: e.title, score: Math.round(score), at: e.at, weight: Math.round(w * 100) / 100, proctored: !!e.proctored, link: e.link ?? null, publicLink: e.publicLink ?? null })
      bySkill.set(s, cur)
    }
  }
  const skills: SkillResult[] = []
  for (const [skill, v] of bySkill) {
    const score = Math.round(v.ws / v.w)
    const confidence = Math.round(v.w * 100) / 100
    skills.push({
      skill,
      level: levelFor(score, v.w, v.proctored),
      score,
      confidence,
      evidenceCount: v.refs.length,
      proctoredCount: v.proctored,
      lastEvidenceAt: new Date(v.last).toISOString(),
      stale: now.getTime() - v.last > STALE_AFTER_DAYS * DAY_MS,
      evidence: v.refs.sort((a, b) => b.weight - a.weight || b.at.localeCompare(a.at)).slice(0, 12),
    })
  }
  const rank = (l: PassportLevel) => PASSPORT_LEVELS.indexOf(l)
  skills.sort((a, b) => rank(b.level) - rank(a.level) || b.score - a.score || b.confidence - a.confidence || a.skill.localeCompare(b.skill))
  const verified = new Set(skills.map((s) => s.skill))
  return {
    skills,
    excluded,
    selfReported: selfReported.map((s) => canonicalSkill(s)).filter((s, i, a) => s && a.indexOf(s) === i && !verified.has(s)).slice(0, 30),
    computedAt: now.toISOString(),
  }
}

// ─── Public view ────────────────────────────────────────────────────────────

export type PassportVisibility = 'private' | 'link' | 'public'

export interface PassportShareSettings {
  visibility: PassportVisibility
  /** Evidence ids the learner hid. */
  hidden: string[]
  /** Evidence ids of private-by-default (company) results the learner chose to show. */
  shown: string[]
  showSelfReported: boolean
}

export interface PublicSkill {
  skill: string
  level: PassportLevel
  score: number
  evidenceCount: number
  proctoredCount: number
  lastEvidenceAt: string
  evidence: Array<{ kind: EvidenceKind; title: string; score: number; at: string; proctored: boolean; link: string | null }>
}

export function isEvidenceVisible(e: Pick<Evidence, 'id' | 'privateByDefault'>, s: Pick<PassportShareSettings, 'hidden' | 'shown'>): boolean {
  if (s.hidden.includes(e.id)) return false
  if (e.privateByDefault) return s.shown.includes(e.id)
  return true
}

/**
 * What other people see: levels recomputed from the visible evidence only (so
 * hiding a result really removes its effect), public links only, no learner
 * links, no excluded rows.
 */
export function publicSkills(evidence: readonly Evidence[], settings: PassportShareSettings, now = new Date()): PublicSkill[] {
  const visible = evidence.filter((e) => isEvidenceVisible(e, settings))
  return computePassport(visible, [], now).skills.map((s) => ({
    skill: s.skill,
    level: s.level,
    score: s.score,
    evidenceCount: s.evidenceCount,
    proctoredCount: s.proctoredCount,
    lastEvidenceAt: s.lastEvidenceAt,
    evidence: s.evidence.map((r) => ({ kind: r.kind, title: r.title, score: r.score, at: r.at, proctored: r.proctored, link: r.publicLink })),
  }))
}

/** Compact searchable index (skill + level rank) stored on the passport doc. */
export function skillIndex(skills: readonly Pick<SkillResult, 'skill' | 'level' | 'score'>[]): Array<{ skill: string; level: PassportLevel; rank: number; score: number }> {
  return skills.map((s) => ({ skill: s.skill, level: s.level, rank: PASSPORT_LEVELS.indexOf(s.level), score: s.score }))
}

// ─── Settings validation ────────────────────────────────────────────────────

export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/
const RESERVED_HANDLES = new Set(['admin', 'api', 'dashboard', 'verify', 'login', 'signup', 'codespectra', 'support', 'help', 'settings', 'p'])

export function validHandle(h: unknown): h is string {
  return typeof h === 'string' && HANDLE_RE.test(h) && !h.includes('--') && !RESERVED_HANDLES.has(h)
}

/** Handle from a username / name ("Priya Raman" → "priyaraman"). */
export function handleBase(raw: string | null | undefined): string {
  const s = String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24)
  return s.length >= 3 ? s : `learner${s}`
}

/** LinkedIn "Add licence or certification" link. */
export function linkedInCertUrl(p: { name: string; verifyUrl: string; issuedAt: string; credentialId: string; orgName?: string }): string {
  const d = new Date(p.issuedAt)
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: p.name.slice(0, 200),
    organizationName: p.orgName || 'CodeSpectra',
    issueYear: String(d.getUTCFullYear()),
    issueMonth: String(d.getUTCMonth() + 1),
    certUrl: p.verifyUrl,
    certId: p.credentialId,
  })
  return `https://www.linkedin.com/profile/add?${q.toString()}`
}

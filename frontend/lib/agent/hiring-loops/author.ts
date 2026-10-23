/**
 * Assessment author loop — spec, coverage and dry-run judgement (pure).
 *
 *   JD / job → TestSpec (skills, band, size, difficulty mix)
 *   draft    → evaluateDraft: skill coverage, difficulty mix, broken questions
 *   dry run  → judgeDryRun: a synthetic "correct" answer must score full
 *              marks and a synthetic wrong / empty answer must score low
 *   loop     → nextStep: propose, refine (fill gaps / replace broken) or give up
 */
import type { AuthorParams } from './types'

export type Band = 'intern' | 'entry' | 'mid' | 'senior' | 'lead'
export type Mix = { Easy: number; Medium: number; Hard: number }

export interface JobLike {
  title: string
  skills?: string[]
  experience_min?: number | null
  experience_max?: number | null
}

export interface TestSpec {
  title: string
  role: string
  experience_band: Band
  skills: string[]
  question_count: number
  duration_minutes: number
  screening_type: 'technical' | 'coding' | 'mixed'
  mix: Mix
}

const CODING_HINTS = /\b(developer|engineer|programmer|sde|swe|backend|frontend|full[- ]?stack|devops|data engineer)\b/i

/** Experience range → band. Pure. */
export function bandFor(min?: number | null, max?: number | null): Band {
  const y = typeof min === 'number' ? min : typeof max === 'number' ? Math.max(0, max - 2) : 1
  if (y < 0.5) return 'intern'
  if (y < 2) return 'entry'
  if (y < 5) return 'mid'
  if (y < 8) return 'senior'
  return 'lead'
}

/** Difficulty mix target by band (sums to `n`). Pure. */
export function targetMix(band: Band, n: number): Mix {
  const share: Record<Band, [number, number, number]> = {
    intern: [0.5, 0.4, 0.1], entry: [0.4, 0.45, 0.15], mid: [0.25, 0.5, 0.25], senior: [0.15, 0.45, 0.4], lead: [0.1, 0.4, 0.5],
  }
  const [e, m] = share[band]
  const easy = Math.round(n * e)
  const med = Math.round(n * m)
  return { Easy: easy, Medium: med, Hard: Math.max(0, n - easy - med) }
}

/** Job (+ skills found in the JD) → test spec. Pure. */
export function specFromJob(job: JobLike, jdSkills: readonly string[], p: Pick<AuthorParams, 'target_questions'>): TestSpec {
  const skills = [...new Set([...(job.skills ?? []), ...jdSkills].map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, 60)))].slice(0, 8)
  const band = bandFor(job.experience_min, job.experience_max)
  const n = Math.max(3, Math.min(60, p.target_questions))
  const coding = CODING_HINTS.test(job.title)
  return {
    title: `${job.title.slice(0, 150)} — screening test`,
    role: job.title.slice(0, 120),
    experience_band: band,
    skills: skills.length ? skills : ['General'],
    question_count: n,
    duration_minutes: Math.max(20, Math.min(180, Math.round(n * (coding ? 4 : 2.5) / 5) * 5)),
    screening_type: coding ? 'mixed' : 'technical',
    mix: targetMix(band, n),
  }
}

export interface DraftQuestion {
  id: string
  type: string
  title?: string
  prompt?: string
  options?: string[]
  answer?: string
  difficulty?: string
  test_cases?: { input: string; output: string }[]
  topic?: string
  subject?: string
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim()

/** Does a question touch this skill (word match in title / prompt / topic)? Pure. */
export function questionCovers(q: DraftQuestion, skill: string): boolean {
  const k = norm(skill)
  if (!k || k === 'general') return true
  const hay = ` ${norm([q.title, q.prompt, q.topic, q.subject].filter(Boolean).join(' '))} `
  return hay.includes(` ${k} `) || (k.length > 4 && hay.includes(k))
}

export function coverage(qs: readonly DraftQuestion[], skills: readonly string[]): { covered: string[]; missing: string[]; pct: number } {
  const real = skills.filter((s) => norm(s) && norm(s) !== 'general')
  if (!real.length) return { covered: [], missing: [], pct: 100 }
  const covered = real.filter((s) => qs.some((q) => questionCovers(q, s)))
  return { covered, missing: real.filter((s) => !covered.includes(s)), pct: Math.round((covered.length / real.length) * 100) }
}

export function difficultyOf(q: DraftQuestion): keyof Mix {
  const d = String(q.difficulty || '').toLowerCase()
  if (d.startsWith('e') || d === 'beginner') return 'Easy'
  if (d.startsWith('h') || d === 'advanced' || d === 'expert' || d === 'tough') return 'Hard'
  return 'Medium'
}

export function mixOf(qs: readonly DraftQuestion[]): Mix {
  const m: Mix = { Easy: 0, Medium: 0, Hard: 0 }
  for (const q of qs) m[difficultyOf(q)]++
  return m
}

/** Structural problems a human would reject before any dry run. Pure. */
export function structuralIssue(q: DraftQuestion): string | null {
  const prompt = String(q.prompt || q.title || '').trim()
  if (prompt.length < 15) return 'too_short'
  const t = String(q.type || '').toLowerCase()
  if (t === 'mcq' || t === 'multiple_choice' || t === 'true_false') {
    const opts = (q.options ?? []).map((o) => String(o).trim()).filter(Boolean)
    if (t !== 'true_false' && opts.length < 3) return 'few_options'
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return 'duplicate_options'
    if (!q.answer || !opts.some((o) => o === String(q.answer).trim())) return 'answer_not_an_option'
  }
  if (t === 'coding' && (q.test_cases ?? []).length < 2) return 'few_test_cases'
  return null
}

export interface DryRunResult { id: string; correct_ratio: number | null; wrong_ratio: number | null; ai: boolean }

/** A question fails the dry run when the right answer is not full marks or a wrong one scores ≥ 40%. Pure. */
export function judgeDryRun(r: DryRunResult): string | null {
  if (r.correct_ratio !== null && r.correct_ratio < 0.99) return 'key_not_full_marks'
  if (r.wrong_ratio !== null && r.wrong_ratio >= 0.4) return 'wrong_answer_scores'
  return null
}

export interface DraftEvaluation {
  coverage_pct: number
  missing_skills: string[]
  mix: Mix
  mix_gap: number
  broken: { id: string; reason: string }[]
  count: number
  ok: boolean
}

export function evaluateDraft(qs: readonly DraftQuestion[], spec: TestSpec, dry: readonly DryRunResult[], p: Pick<AuthorParams, 'min_coverage_pct'>): DraftEvaluation {
  const cov = coverage(qs, spec.skills)
  const mix = mixOf(qs)
  const mix_gap = Math.abs(mix.Easy - spec.mix.Easy) + Math.abs(mix.Medium - spec.mix.Medium) + Math.abs(mix.Hard - spec.mix.Hard)
  const broken: { id: string; reason: string }[] = []
  for (const q of qs) {
    const s = structuralIssue(q)
    if (s) { broken.push({ id: q.id, reason: s }); continue }
    const d = dry.find((x) => x.id === q.id)
    const j = d ? judgeDryRun(d) : null
    if (j) broken.push({ id: q.id, reason: j })
  }
  const enough = qs.length - broken.length >= Math.ceil(spec.question_count * 0.8)
  return {
    coverage_pct: cov.pct, missing_skills: cov.missing, mix, mix_gap, broken, count: qs.length,
    ok: enough && broken.length === 0 && cov.pct >= p.min_coverage_pct && mix_gap <= Math.ceil(spec.question_count * 0.4),
  }
}

/** After `round` (1-based) rounds: propose, refine or give up. Pure. */
export function nextStep(ev: DraftEvaluation, round: number, p: Pick<AuthorParams, 'max_rounds'>): 'propose' | 'refine' | 'give_up' {
  if (ev.ok) return 'propose'
  if (round < p.max_rounds) return 'refine'
  // Out of rounds: still worth a human look when most of it is usable.
  return ev.count - ev.broken.length >= 3 ? 'propose' : 'give_up'
}

/** Which questions to drop and what to ask the generator for next round. Pure. */
export function refinePlan(ev: DraftEvaluation, spec: TestSpec): { drop: string[]; fill: { skills: string[]; count: number; mix: Mix } } {
  const drop = ev.broken.map((b) => b.id)
  const kept = ev.count - drop.length
  const need = Math.max(0, spec.question_count - kept)
  const want: Mix = {
    Easy: Math.max(0, spec.mix.Easy - ev.mix.Easy),
    Medium: Math.max(0, spec.mix.Medium - ev.mix.Medium),
    Hard: Math.max(0, spec.mix.Hard - ev.mix.Hard),
  }
  const count = Math.max(need, ev.missing_skills.length ? Math.min(ev.missing_skills.length, 5) : 0)
  return { drop, fill: { skills: ev.missing_skills.length ? ev.missing_skills : spec.skills, count, mix: want } }
}

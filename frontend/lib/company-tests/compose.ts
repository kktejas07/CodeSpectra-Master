/**
 * Company test composer — pure (no DB, no AI). Tested in
 * tests/company-tests-compose.test.ts.
 *
 *   difficultyTargets   how many Easy/Medium/Hard a section needs at a level
 *   matchesSection      does a bank question fit a section (type + category)
 *   composeSection      bank first: pick approved questions per difficulty,
 *                       spread across the section's categories; report the
 *                       shortfall per difficulty (the AI fills only that)
 *   rotateSection       weekly refresh: swap ~N% of a section's questions for
 *                       unused ones of the same difficulty
 *   scoreAttempt        per-section score with negative marking vs cut-off
 */
import { isScoredType, metaFor, resolveQuestionType } from '@/lib/question-types'
import { compareObjectiveAnswer, type QuestionGradingSpec } from '@/lib/grading'
import { BANK_DIFFICULTIES, LEVEL_MIX, type BankDifficulty, type PatternSection, type PracticeLevel } from './types'

export type Rand = () => number

/** Mulberry32 — small seeded PRNG so selections are reproducible in tests. */
export function seededRand(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], rand: Rand = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Split `n` by weights with largest-remainder rounding (sums to exactly n). */
export function apportion<K extends string>(n: number, weights: Record<K, number>): Record<K, number> {
  const keys = Object.keys(weights) as K[]
  const total = keys.reduce((s, k) => s + Math.max(0, weights[k]), 0)
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>
  if (n <= 0 || total <= 0) return out
  const raw = keys.map((k) => ({ k, v: (Math.max(0, weights[k]) / total) * n }))
  let used = 0
  for (const r of raw) { out[r.k] = Math.floor(r.v); used += out[r.k] }
  const order = [...raw].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)) || keys.indexOf(a.k) - keys.indexOf(b.k))
  for (let i = 0; used < n; i++, used++) out[order[i % order.length].k]++
  return out
}

export function difficultyTargets(level: PracticeLevel, count: number): Record<BankDifficulty, number> {
  return apportion(count, LEVEL_MIX[level])
}

/** Words that mark a bank question as belonging to a category (matched on subject + tags). */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  quant: ['quant', 'quantitative', 'aptitude', 'numerical', 'arithmetic', 'math'],
  logical: ['logical', 'reasoning', 'logic', 'puzzle'],
  verbal: ['verbal', 'english', 'grammar', 'reading comprehension', 'vocabulary'],
  coding: ['coding', 'programming', 'dsa', 'algorithm', 'data structure'],
  technical: ['technical', 'computer science', 'cs fundamentals', 'dbms', 'operating system', 'networking', 'oops'],
  pseudocode: ['pseudocode', 'pseudo code', 'code output', 'output prediction'],
  essay: ['essay', 'email writing', 'written communication'],
  'system design': ['system design', 'design'],
  behavioral: ['behavioral', 'behavioural', 'situational', 'leadership'],
}

export function categoryWords(category: string): string[] {
  const c = category.trim().toLowerCase().replace(/[_-]+/g, ' ')
  return CATEGORY_SYNONYMS[c] ?? [c]
}

export interface BankLite {
  id: string
  type: string
  difficulty: BankDifficulty
  subject?: string
  tags?: string[]
  branch?: string
}

function haystack(q: BankLite): string {
  return [q.subject || '', ...(q.tags || [])].join(' | ').toLowerCase().replace(/[_-]+/g, ' ')
}

/** Category of a question for this section ('' when the section has no categories), or null when it doesn't fit. */
export function sectionCategoryOf(q: BankLite, section: Pick<PatternSection, 'questionTypes' | 'categories'>): string | null {
  const type = resolveQuestionType(q.type)
  if (!type || !section.questionTypes.includes(type)) return null
  if (!section.categories.length) return ''
  const hay = haystack(q)
  const coding = metaFor(type).group === 'coding'
  for (const c of section.categories) {
    if ((q.tags || []).some((t) => t.toLowerCase() === `category:${c}`)) return c
    // Any code question counts for a coding category (bank subjects are topics like "Arrays").
    if (coding && (c === 'coding' || c === 'programming')) return c
    if (type === 'output_prediction' && c === 'pseudocode') return c
    if (categoryWords(c).some((w) => hay.includes(w))) return c
  }
  return null
}

export function matchesSection(q: BankLite, section: Pick<PatternSection, 'questionTypes' | 'categories'>, branch?: string): boolean {
  if (branch && q.branch && q.branch !== branch) return false
  return sectionCategoryOf(q, section) !== null
}

export interface SectionComposition {
  /** Picked question ids, in display order. */
  picked: string[]
  /** Per difficulty, how many questions the bank couldn't supply. */
  shortfall: Record<BankDifficulty, number>
  /** For the shortfall: how many to generate per category, per difficulty. */
  generate: { difficulty: BankDifficulty; category: string; count: number }[]
}

/**
 * Bank first. `pool` = approved, active bank questions; ones not fitting the
 * section (type / category / branch) or in `exclude` are skipped. Within each
 * difficulty picks round-robin over the section's categories so one topic
 * can't crowd out the rest.
 */
export function composeSection(input: {
  section: PatternSection
  level: PracticeLevel
  pool: readonly BankLite[]
  exclude?: ReadonlySet<string>
  branch?: string
  rand?: Rand
}): SectionComposition {
  const { section, level, pool, exclude, branch } = input
  const rand = input.rand ?? Math.random
  const targets = difficultyTargets(level, section.questionCount)
  const cats = section.categories.length ? section.categories : ['']
  const byKey = new Map<string, BankLite[]>()
  const seen = new Set<string>()
  for (const q of shuffle(pool, rand)) {
    if (seen.has(q.id) || exclude?.has(q.id)) continue
    if (branch && q.branch && q.branch !== branch) continue
    const cat = sectionCategoryOf(q, section)
    if (cat === null) continue
    seen.add(q.id)
    const key = `${q.difficulty}|${cat}`
    const list = byKey.get(key) ?? []
    list.push(q)
    byKey.set(key, list)
  }

  const picked: string[] = []
  const shortfall = { Easy: 0, Medium: 0, Hard: 0 } as Record<BankDifficulty, number>
  const generate: SectionComposition['generate'] = []
  for (const d of BANK_DIFFICULTIES) {
    const want = targets[d]
    if (!want) continue
    const lists = cats.map((c) => byKey.get(`${d}|${c}`) ?? [])
    const perCat = cats.map(() => 0)
    let got = 0
    // Round-robin; an exhausted category hands its turn to the next one.
    for (let progressed = true; got < want && progressed;) {
      progressed = false
      for (let i = 0; i < cats.length && got < want; i++) {
        const q = lists[i].shift()
        if (!q) continue
        picked.push(q.id)
        perCat[i]++
        got++
        progressed = true
      }
    }
    const missing = want - got
    shortfall[d] = missing
    if (missing > 0) {
      // Generate for the categories that came up shortest against an even share.
      const even = apportion(want, Object.fromEntries(cats.map((c, i) => [String(i), 1])) as Record<string, number>)
      const need = cats.map((_, i) => Math.max(0, even[String(i)] - perCat[i]))
      const split = need.some((n) => n > 0)
        ? apportion(missing, Object.fromEntries(need.map((n, i) => [String(i), n])) as Record<string, number>)
        : apportion(missing, Object.fromEntries(cats.map((_, i) => [String(i), 1])) as Record<string, number>)
      cats.forEach((c, i) => { const n = split[String(i)]; if (n > 0) generate.push({ difficulty: d, category: c, count: n }) })
    }
  }
  return { picked, shortfall, generate }
}

export interface RotationResult {
  questionIds: string[]
  swapped: number
  /** Swaps that had no unused bank question of the same difficulty. */
  unmet: Record<BankDifficulty, number>
}

/**
 * Swap ~`fraction` of `current` for unused pool questions of the same
 * difficulty, in place (order kept). A question with no replacement stays,
 * so a refresh never leaves a version short.
 */
export function rotateSection(input: {
  current: readonly string[]
  section: PatternSection
  pool: readonly BankLite[]
  fraction: number
  /** Ids to avoid as replacements (e.g. used in the last refresh). */
  avoid?: ReadonlySet<string>
  branch?: string
  rand?: Rand
}): RotationResult {
  const rand = input.rand ?? Math.random
  const byId = new Map(input.pool.map((q) => [q.id, q]))
  const inUse = new Set(input.current)
  const k = Math.round(input.current.length * Math.min(1, Math.max(0, input.fraction)))
  const fresh = new Map<BankDifficulty, BankLite[]>(BANK_DIFFICULTIES.map((d) => [d, []]))
  for (const q of shuffle(input.pool, rand)) {
    if (inUse.has(q.id) || input.avoid?.has(q.id)) continue
    if (!matchesSection(q, input.section, input.branch)) continue
    fresh.get(q.difficulty)!.push(q)
  }
  const out = [...input.current]
  const unmet = { Easy: 0, Medium: 0, Hard: 0 } as Record<BankDifficulty, number>
  let swapped = 0
  for (const idx of shuffle(out.map((_, i) => i), rand)) {
    if (swapped >= k) break
    const d = byId.get(out[idx])?.difficulty
    if (!d) continue // not in the pool any more (deactivated): keep, the build will catch it
    const next = fresh.get(d)!.shift()
    if (!next) { unmet[d]++; continue }
    out[idx] = next.id
    swapped++
  }
  return { questionIds: out, swapped, unmet }
}

// ─── Scoring ────────────────────────────────────────────────────────────────

export interface ScoreQuestion extends QuestionGradingSpec {
  id: string
  marks: number
}

export interface ScoreSectionInput {
  id: string
  name: string
  questions: ScoreQuestion[]
  answers: Record<string, string>
  /** Submitted after the section's time ran out: answers don't count. */
  late?: boolean
  cutoffPercent: number
  /**
   * 0..1 for code questions whose test cases ran on the server. A code or
   * written question without an entry can't be auto-scored and is left out
   * of the score (the review shows the model answer instead).
   */
  codeRatios?: Record<string, number>
}

export interface QuestionResult {
  id: string
  status: 'correct' | 'partial' | 'wrong' | 'unanswered' | 'not_scored'
  awarded: number
}

export interface SectionScore {
  id: string
  name: string
  score: number
  max: number
  percent: number
  cutoffPercent: number
  passed: boolean
  correct: number
  wrong: number
  unanswered: number
  late: boolean
  questions: QuestionResult[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Marks per question in a practice run: 1 per objective question, 10 per code question. */
export function practiceMarks(type: string): number {
  return metaFor(type).deterministic ? 1 : 10
}

/**
 * Negative marking applies to fully wrong objective answers only; partial
 * credit (matching, matrix…) and code are never penalised; blanks score 0.
 */
export function scoreSection(s: ScoreSectionInput, negativeMarking: number): SectionScore {
  const neg = Math.min(1, Math.max(0, negativeMarking || 0))
  let score = 0
  let max = 0
  let correct = 0
  let wrong = 0
  let unanswered = 0
  const questions: QuestionResult[] = []
  for (const q of s.questions) {
    const deterministic = metaFor(q.type).deterministic
    if (!isScoredType(q.type) || (!deterministic && s.codeRatios?.[q.id] === undefined)) {
      questions.push({ id: q.id, status: 'not_scored', awarded: 0 })
      continue
    }
    const marks = Math.max(0, Number(q.marks) || 0)
    max += marks
    const ans = s.late ? '' : String(s.answers[q.id] ?? '').trim()
    if (!ans) { unanswered++; questions.push({ id: q.id, status: 'unanswered', awarded: 0 }); continue }
    let ratio: number
    let objective = false
    if (deterministic) {
      ratio = compareObjectiveAnswer(q, ans).ratio
      objective = true
    } else {
      ratio = Math.min(1, Math.max(0, s.codeRatios?.[q.id] ?? 0))
    }
    let awarded: number
    let status: QuestionResult['status']
    if (ratio >= 1) { awarded = marks; status = 'correct'; correct++ }
    else if (ratio > 0) { awarded = round2(marks * ratio); status = 'partial' }
    else { awarded = objective ? -round2(marks * neg) : 0; status = 'wrong'; wrong++ }
    score += awarded
    questions.push({ id: q.id, status, awarded })
  }
  score = round2(score)
  const percent = max > 0 ? round2(Math.max(0, score) / max * 100) : 0
  return {
    id: s.id, name: s.name, score, max, percent, cutoffPercent: s.cutoffPercent,
    passed: percent >= s.cutoffPercent, correct, wrong, unanswered, late: s.late === true, questions,
  }
}

export interface AttemptScore {
  sections: SectionScore[]
  score: number
  max: number
  percent: number
  cutoffPercent: number
  /** Overall cut-off met AND every section's cut-off met. */
  passed: boolean
}

export function scoreAttempt(sections: ScoreSectionInput[], negativeMarking: number, cutoffPercent: number): AttemptScore {
  const scored = sections.map((s) => scoreSection(s, negativeMarking))
  const score = round2(scored.reduce((t, s) => t + s.score, 0))
  const max = scored.reduce((t, s) => t + s.max, 0)
  const percent = max > 0 ? round2(Math.max(0, score) / max * 100) : 0
  return { sections: scored, score, max, percent, cutoffPercent, passed: percent >= cutoffPercent && scored.every((s) => s.passed) }
}

// ─── Section timing ─────────────────────────────────────────────────────────

/** Answers that arrive up to this long after a section's deadline still count (auto-submit + network). */
export const SECTION_GRACE_MS = 30_000

export function sectionDeadline(startedAtIso: string, minutes: number): string {
  return new Date(new Date(startedAtIso).getTime() + minutes * 60_000).toISOString()
}

export function isLateSubmit(deadlineIso: string, now: Date, graceMs = SECTION_GRACE_MS): boolean {
  return now.getTime() > new Date(deadlineIso).getTime() + graceMs
}

export interface TimedSectionState {
  timeMinutes: number
  startedAt: string | null
  deadline: string | null
  submittedAt: string | null
  late: boolean
}

/**
 * Close every section whose time (plus grace) ran out while the learner was
 * away, the way a real test keeps its clock running: the next section starts
 * at the previous one's deadline. Returns the new current index
 * (=== sections.length when the whole attempt is over). Mutates `sections`.
 */
export function advanceExpiredSections(sections: TimedSectionState[], current: number, now: Date, graceMs = SECTION_GRACE_MS): number {
  let i = current
  while (i < sections.length) {
    const s = sections[i]
    if (!s.startedAt || !s.deadline) {
      s.startedAt = now.toISOString()
      s.deadline = sectionDeadline(s.startedAt, s.timeMinutes)
    }
    if (!isLateSubmit(s.deadline, now, graceMs)) break
    s.submittedAt = s.deadline
    s.late = true
    const next = sections[i + 1]
    if (next && !next.startedAt) {
      next.startedAt = s.deadline
      next.deadline = sectionDeadline(next.startedAt, next.timeMinutes)
    }
    i++
  }
  return i
}

/**
 * Weak-area detection (pure, unit tested in tests/study-plan.test.ts).
 *
 * Every signal becomes weighted evidence for an area (`domain` or `domain::topic`):
 *  - question answers (tests, adaptive runs, company tests, practice sets): a correct answer
 *    counts 0.8 on Easy and 1 on Medium/Hard; a wrong answer 0, except 0.25 on Hard (missing a
 *    hard question says less than missing an easy one). Evidence weight Easy 0.8 · Medium 1 ·
 *    Hard 1.3, halved every 45 days of age.
 *  - company-test section scores without per-question data: `questions` answers at the
 *    section's accuracy (Medium).
 *  - adaptive peak level: 3 answers at 0.3 / 0.55 / 0.8 for a peak of Easy / Medium / Hard.
 *  - AI mock interview category scores: 3 answers at the score.
 * Mastery = (credit + prior·0.5) / (weight + prior), prior 2 — little data stays near 50 %.
 * Priority = (1 − mastery) × confidence (evidence / (evidence + 4)), plus a cold-start
 * priority for the target's areas the learner has not been tested on yet.
 */
import { DEFAULT_DOMAINS } from '@/lib/question-bot/domains'
import type { Difficulty, WeakArea } from './types'

export interface AnswerSignal { domain: string; topic?: string | null; difficulty?: Difficulty | null; correct: boolean; at?: string | null; source: string }
export interface SectionSignal { categories: string[]; percent: number; questions: number; at?: string | null; source: string }
export interface AdaptiveSignal { domain: string; peak: Difficulty; at?: string | null }
export interface InterviewSignal { category: string; score: number; at?: string | null }

export interface Signals {
  answers: AnswerSignal[]
  sections: SectionSignal[]
  adaptive: AdaptiveSignal[]
  interviews: InterviewSignal[]
}

export const EMPTY_SIGNALS: Signals = { answers: [], sections: [], adaptive: [], interviews: [] }

const PRIOR = 2
const HALF_LIFE_DAYS = 45
const DIFF_WEIGHT: Record<Difficulty, number> = { Easy: 0.8, Medium: 1, Hard: 1.3 }

/** Company-pattern section categories → bank domain + topic (lib/question-bot/domains.ts). */
export const CATEGORY_AREA: Record<string, { domain: string; topic: string | null }> = {
  quant: { domain: 'aptitude', topic: 'Quantitative aptitude' },
  logical: { domain: 'aptitude', topic: 'Logical reasoning' },
  verbal: { domain: 'aptitude', topic: 'Verbal ability' },
  di: { domain: 'aptitude', topic: 'Data interpretation' },
  coding: { domain: 'cse', topic: 'Data structures and algorithms' },
  pseudocode: { domain: 'cse', topic: 'Data structures and algorithms' },
  technical: { domain: 'cse', topic: null },
  essay: { domain: 'aptitude', topic: 'Verbal ability' },
}

export function categoryArea(category: string): { domain: string; topic: string | null } {
  const c = String(category || '').toLowerCase().trim()
  return CATEGORY_AREA[c] ?? { domain: c.replace(/[^a-z0-9_]/g, '_') || 'general', topic: null }
}

const DOMAIN_LABEL = new Map<string, string>(DEFAULT_DOMAINS.map((d) => [d.id, d.label]))
export const domainLabel = (id: string): string => (id === 'interview' ? 'Interview skills' : DOMAIN_LABEL.get(id) || id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()))

export function areaKey(domain: string, topic?: string | null): string {
  const d = String(domain || 'general').toLowerCase().trim().slice(0, 40)
  const t = typeof topic === 'string' ? topic.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  return t ? `${d}::${t}` : d
}

export function decay(at: string | null | undefined, nowMs: number): number {
  const t = at ? Date.parse(at) : NaN
  if (!Number.isFinite(t)) return 1
  const days = Math.max(0, (nowMs - t) / 86_400_000)
  return Math.pow(0.5, days / HALF_LIFE_DAYS)
}

export function nextDifficultyFor(mastery: number): Difficulty {
  return mastery < 0.45 ? 'Easy' : mastery < 0.75 ? 'Medium' : 'Hard'
}

function credit(correct: boolean, d: Difficulty): number {
  if (correct) return d === 'Easy' ? 0.8 : 1
  return d === 'Hard' ? 0.25 : 0
}

interface Acc { domain: string; topic: string | null; w: number; c: number; n: number; sources: Set<string> }

export function computeWeakAreas(s: Signals, opts: { nowMs?: number; focus?: { domain: string; topic?: string | null }[]; limit?: number } = {}): WeakArea[] {
  const now = opts.nowMs ?? Date.now()
  const acc = new Map<string, Acc>()
  const add = (domain: string, topic: string | null | undefined, w: number, c: number, source: string) => {
    if (!(w > 0) || !domain) return
    const key = areaKey(domain, topic)
    const a = acc.get(key) ?? { domain: key.split('::')[0], topic: key.includes('::') ? key.split('::')[1] : null, w: 0, c: 0, n: 0, sources: new Set<string>() }
    a.w += w
    a.c += c * w
    a.n += 1
    a.sources.add(source)
    acc.set(key, a)
  }

  for (const a of s.answers) {
    const d: Difficulty = a.difficulty === 'Easy' || a.difficulty === 'Hard' ? a.difficulty : 'Medium'
    add(a.domain, a.topic, DIFF_WEIGHT[d] * decay(a.at, now), credit(!!a.correct, d), a.source)
  }
  for (const sec of s.sections) {
    const cats = sec.categories.length ? sec.categories : ['general']
    const q = Math.max(0, Math.min(200, Math.round(sec.questions)))
    const p = Math.max(0, Math.min(100, sec.percent)) / 100
    for (const cat of cats) {
      const { domain, topic } = categoryArea(cat)
      // spread the section's questions across its categories
      add(domain, topic, (q / cats.length) * decay(sec.at, now), p, sec.source)
    }
  }
  for (const r of s.adaptive) {
    const level = r.peak === 'Hard' ? 0.8 : r.peak === 'Medium' ? 0.55 : 0.3
    add(r.domain, null, 3 * decay(r.at, now), level, 'adaptive')
  }
  for (const i of s.interviews) {
    const score = Math.max(0, Math.min(1, i.score))
    add('interview', i.category, 3 * decay(i.at, now), score, 'interview')
  }

  const out: WeakArea[] = []
  for (const [key, a] of acc) {
    const mastery = (a.c + PRIOR * 0.5) / (a.w + PRIOR)
    const confidence = a.w / (a.w + 4)
    out.push({
      key, domain: a.domain, topic: a.topic, label: a.topic ? `${a.topic} (${domainLabel(a.domain)})` : domainLabel(a.domain),
      mastery: round3(mastery), evidence: round3(a.w), priority: round3((1 - mastery) * confidence), next_difficulty: nextDifficultyFor(mastery), sources: [...a.sources].sort(),
    })
  }
  // Cold start: target areas without evidence get a middling priority so the plan covers them.
  for (const f of opts.focus || []) {
    const key = areaKey(f.domain, f.topic)
    if (acc.has(key)) continue
    if (out.some((o) => o.key === key)) continue
    out.push({ key, domain: key.split('::')[0], topic: f.topic ?? null, label: f.topic ? `${f.topic} (${domainLabel(f.domain)})` : domainLabel(f.domain), mastery: 0.5, evidence: 0, priority: 0.3, next_difficulty: 'Easy', sources: ['target'] })
  }
  out.sort((x, y) => y.priority - x.priority || x.mastery - y.mastery || x.key.localeCompare(y.key))
  return out.slice(0, opts.limit ?? 30)
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Areas of a company pattern's sections (cold-start focus for company targets). */
export function patternFocus(sections: { categories: string[] }[]): { domain: string; topic: string | null }[] {
  const seen = new Set<string>()
  const out: { domain: string; topic: string | null }[] = []
  for (const s of sections) for (const c of s.categories) {
    const a = categoryArea(c)
    const k = areaKey(a.domain, a.topic)
    if (!seen.has(k)) { seen.add(k); out.push(a) }
  }
  return out
}

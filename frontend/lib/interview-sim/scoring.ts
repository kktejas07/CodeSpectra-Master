/**
 * Mock-interview scoring, aggregation and flow decisions (pure, client-safe).
 *
 *  - rubric weights per round → a 0–100 score per question
 *  - code runs cap the correctness score (the sandbox result beats the model)
 *  - report aggregation: overall, dimension averages, readiness band
 *  - voice stats: filler words and pace (words per minute)
 *  - next step: follow-up or next planned question, within the turn budget
 *  - caps: per-user daily sessions, monthly and per-session AI spend
 *  - gap links: Learn search + practice pages for a gap topic
 *
 * Covered by tests/interview-sim.test.ts.
 */
import {
  DIMENSIONS, type CodeRun, type DimScores, type Dimension, type InterviewSimSettings, type QuestionResult, type Readiness,
  type ReportLink, type RoundType, type SimReport, type SimTurn, type VoiceStats,
} from './types'

// ─── Rubric ─────────────────────────────────────────────────────────────────

/** How much each dimension counts per round (sums to 1). */
export const ROUND_WEIGHTS: Record<RoundType, DimScores> = {
  hr: { communication: 0.35, correctness: 0.15, depth: 0.2, structure: 0.3 },
  technical: { communication: 0.2, correctness: 0.4, depth: 0.3, structure: 0.1 },
  coding: { communication: 0.15, correctness: 0.5, depth: 0.25, structure: 0.1 },
  system_design: { communication: 0.2, correctness: 0.25, depth: 0.35, structure: 0.2 },
}

/** What the interviewer scores against, per round (goes into the system prompt). */
export const ROUND_RUBRIC: Record<RoundType, Record<Dimension, string>> = {
  hr: {
    communication: 'Clear, concise, confident; answers the question asked.',
    correctness: 'Honest, relevant example; claims are plausible and specific.',
    depth: 'Shows reflection: what they learned, impact, numbers where possible.',
    structure: 'STAR: situation, task, action (their own), result.',
  },
  technical: {
    communication: 'Explains plainly, defines terms, checks understanding.',
    correctness: 'Facts and definitions are right; no misconceptions.',
    depth: 'Trade-offs, edge cases, internals, when to use what.',
    structure: 'Starts with the core idea, then details and an example.',
  },
  coding: {
    communication: 'Thinks aloud: restates the problem, explains the approach.',
    correctness: 'Code is correct on the sample cases and edge cases.',
    depth: 'Complexity analysis, alternatives, optimisations.',
    structure: 'Clarifies, plans, codes, then tests — readable code.',
  },
  system_design: {
    communication: 'Drives the discussion, states assumptions, summarises.',
    correctness: 'Components fit the requirements; numbers are sensible.',
    depth: 'Scaling, data model, consistency, failure modes, trade-offs.',
    structure: 'Requirements → estimates → high-level → deep dive → wrap-up.',
  },
}

/** A score from the model → integer 0–5 (missing / junk → 0). */
export function clampDim(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(5, Math.round(n)))
}

export function cleanScores(raw: unknown): DimScores {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    communication: clampDim(o.communication),
    correctness: clampDim(o.correctness),
    depth: clampDim(o.depth),
    structure: clampDim(o.structure),
  }
}

/** Rubric-weighted 0–100 for one question. */
export function questionScore(s: DimScores, round: RoundType): number {
  const w = ROUND_WEIGHTS[round]
  let total = 0
  for (const d of DIMENSIONS) total += (s[d] / 5) * w[d]
  return Math.round(total * 100)
}

/**
 * The sandbox caps correctness: all sample cases pass → no cap; some pass →
 * at most 1 + 3 × pass ratio (rounded down); none pass or it failed to run → at most 1.
 */
export function capCorrectness(s: DimScores, run: CodeRun | undefined): DimScores {
  if (!run || run.total <= 0) return s
  const ratio = run.passed / run.total
  const cap = ratio >= 1 ? 5 : run.passed === 0 || run.error ? 1 : Math.floor(1 + 3 * ratio)
  return { ...s, correctness: Math.min(s.correctness, cap) }
}

/** A flagged (prompt-guard) answer never scores above 2 on any dimension. */
export function capFlagged(s: DimScores): DimScores {
  return { communication: Math.min(s.communication, 2), correctness: Math.min(s.correctness, 2), depth: Math.min(s.depth, 2), structure: Math.min(s.structure, 2) }
}

// ─── Report aggregation ─────────────────────────────────────────────────────

export function readinessFor(overall: number, answered: number, planned: number, anyFlagged = false): Readiness {
  // Half the plan or more must be answered for a "ready" verdict.
  const coverage = planned > 0 ? answered / planned : 0
  let r: Readiness = overall >= 80 ? 'ready' : overall >= 65 ? 'almost' : overall >= 50 ? 'developing' : 'not_yet'
  if (r === 'ready' && (coverage < 0.5 || anyFlagged)) r = 'almost'
  if (answered === 0) r = 'not_yet'
  return r
}

export function aggregateResults(results: readonly QuestionResult[], planned: number): Pick<SimReport, 'overall' | 'readiness' | 'dimension_averages' | 'answered' | 'planned'> {
  const answered = results.length
  const avg: DimScores = { communication: 0, correctness: 0, depth: 0, structure: 0 }
  if (answered) {
    for (const d of DIMENSIONS) avg[d] = Math.round((results.reduce((s, r) => s + r.scores[d], 0) / answered) * 10) / 10
  }
  // Unanswered planned questions count as 0 so ending early can't inflate the score.
  // (When the platform cut the session short, the engine passes planned = answered.)
  const denom = Math.max(answered, planned)
  const overall = denom ? Math.round(results.reduce((s, r) => s + r.score, 0) / denom) : 0
  return { overall, readiness: readinessFor(overall, answered, planned, results.some((r) => r.flagged)), dimension_averages: avg, answered, planned }
}

/** Strongest / weakest dimensions (for the fallback summary). */
export function rankDimensions(avg: DimScores): { best: Dimension[]; worst: Dimension[] } {
  const sorted = [...DIMENSIONS].sort((a, b) => avg[b] - avg[a])
  return { best: sorted.slice(0, 2), worst: sorted.slice(-2).reverse() }
}

// ─── Voice stats ────────────────────────────────────────────────────────────

/** Single-word fillers, and multi-word ones matched as phrases. */
const FILLER_WORDS = ['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'like', 'basically', 'actually', 'literally', 'so', 'right', 'okay']
const FILLER_PHRASES = ['you know', 'i mean', 'kind of', 'sort of']

/**
 * Filler words in a transcript. "like" / "so" / "right" / "okay" are only
 * counted at the start of a clause or next to another filler, so "I like Go"
 * or "so that the cache…" mid-sentence are not penalised.
 */
export function countFillers(text: string): { count: number; fillers: Record<string, number>; words: number } {
  const lower = (text || '').toLowerCase().replace(/[’']/g, "'")
  const tokens = lower.split(/[^a-z']+/).filter(Boolean)
  const fillers: Record<string, number> = {}
  const bump = (w: string) => { fillers[w] = (fillers[w] || 0) + 1 }
  const soft = new Set(['like', 'so', 'right', 'okay', 'actually', 'basically', 'literally'])
  // Clause starts: positions right after . , ? ! or at the beginning.
  const clauseStart = new Set<number>([0])
  {
    let idx = 0
    const parts = lower.split(/([.,?!;:]+)/)
    for (const p of parts) {
      if (/^[.,?!;:]+$/.test(p)) { clauseStart.add(idx); continue }
      idx += p.split(/[^a-z']+/).filter(Boolean).length
    }
  }
  const hard = new Set(FILLER_WORDS.filter((w) => !soft.has(w)))
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (hard.has(t)) { bump(t); continue }
    if (soft.has(t)) {
      const prevFiller = i > 0 && (hard.has(tokens[i - 1]) || soft.has(tokens[i - 1]))
      const nextFiller = i + 1 < tokens.length && hard.has(tokens[i + 1])
      if (clauseStart.has(i) || prevFiller || nextFiller || t === 'basically' || t === 'literally') bump(t)
    }
  }
  for (const p of FILLER_PHRASES) {
    const re = new RegExp(`\\b${p.replace(' ', '\\s+')}\\b`, 'g')
    const n = (lower.match(re) || []).length
    if (n) fillers[p] = (fillers[p] || 0) + n
  }
  const count = Object.values(fillers).reduce((s, n) => s + n, 0)
  return { count, fillers, words: tokens.length }
}

/** Words per minute (null when the duration is too short to tell). */
export function wordsPerMinute(words: number, durationMs: number | undefined): number | null {
  if (!durationMs || durationMs < 5000 || words < 5) return null
  return Math.round(words / (durationMs / 60_000))
}

export function voiceStatsFor(text: string, durationMs: number | undefined): VoiceStats {
  const f = countFillers(text)
  return { words: f.words, filler_count: f.count, fillers: f.fillers, wpm: wordsPerMinute(f.words, durationMs), duration_ms: Math.max(0, durationMs || 0) }
}

/** Interview pace: under 110 wpm slow, over 170 fast. */
export function paceBand(wpm: number | null): 'slow' | 'good' | 'fast' | null {
  if (wpm === null) return null
  return wpm < 110 ? 'slow' : wpm > 170 ? 'fast' : 'good'
}

export function aggregateVoice(turns: readonly SimTurn[]): SimReport['voice'] | undefined {
  const v = turns.filter((t) => t.voice).map((t) => t.voice as VoiceStats)
  if (!v.length) return undefined
  const words = v.reduce((s, x) => s + x.words, 0)
  const filler = v.reduce((s, x) => s + x.filler_count, 0)
  const ms = v.reduce((s, x) => s + x.duration_ms, 0)
  const all: Record<string, number> = {}
  for (const x of v) for (const [w, n] of Object.entries(x.fillers)) all[w] = (all[w] || 0) + n
  const wpm = wordsPerMinute(words, ms)
  return {
    words,
    filler_count: filler,
    filler_per_100: words ? Math.round((filler / words) * 1000) / 10 : 0,
    top_fillers: Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word, count]) => ({ word, count })),
    wpm,
    pace: paceBand(wpm),
  }
}

// ─── Flow ───────────────────────────────────────────────────────────────────

export type NextStep = { kind: 'followup'; text: string } | { kind: 'next'; index: number } | { kind: 'end' }

/**
 * After an answer: ask the model's follow-up (when it offered one, this
 * question still has follow-ups left and the turn budget allows), else move
 * to the next planned question, else end.
 */
export function nextStep(p: {
  cursor: number
  planned: number
  followupsUsed: number
  maxFollowups: number
  followup: string | null | undefined
  turnsSoFar: number
  /** Budget exhausted (session cost cap / monthly cap) — wrap up now. */
  outOfBudget?: boolean
}): NextStep {
  if (p.outOfBudget) return { kind: 'end' }
  const maxTurns = p.planned * (1 + p.maxFollowups)
  const f = (p.followup || '').trim()
  if (f.length >= 8 && p.followupsUsed < p.maxFollowups && p.turnsSoFar < maxTurns) return { kind: 'followup', text: f }
  if (p.cursor + 1 < p.planned) return { kind: 'next', index: p.cursor + 1 }
  return { kind: 'end' }
}

/** Keep an interviewer line short: whole sentences up to `max` characters. */
export function shortLine(text: string, max = 280): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  return (end > max * 0.4 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim()
}

// ─── Caps ───────────────────────────────────────────────────────────────────

export type CapCheck = { ok: true } | { ok: false; reason: string }

export function canStartSession(s: Pick<InterviewSimSettings, 'enabled' | 'daily_sessions_per_user' | 'monthly_cost_cap_usd'>, startedToday: number, spentThisMonthUsd: number): CapCheck {
  if (!s.enabled) return { ok: false, reason: 'Mock interviews are switched off right now.' }
  if (startedToday >= s.daily_sessions_per_user) {
    return { ok: false, reason: `You've used today's ${s.daily_sessions_per_user} mock interview${s.daily_sessions_per_user === 1 ? '' : 's'}. Come back tomorrow, or review your reports meanwhile.` }
  }
  if (spentThisMonthUsd >= s.monthly_cost_cap_usd) return { ok: false, reason: 'Mock interviews have reached this month\'s usage limit. Try again next month.' }
  return { ok: true }
}

/** May the session make another AI call? */
export function canSpend(s: Pick<InterviewSimSettings, 'monthly_cost_cap_usd' | 'session_cost_cap_usd'>, sessionSpentUsd: number, monthSpentUsd: number): boolean {
  return sessionSpentUsd < s.session_cost_cap_usd && monthSpentUsd < s.monthly_cost_cap_usd
}

// ─── Gap links ──────────────────────────────────────────────────────────────

/** Practice + Learn links for one gap topic (Learn posts found by the server are added before these). */
export function gapLinks(topic: string, round: RoundType, patternId: string | null): ReportLink[] {
  const q = encodeURIComponent(topic.trim().slice(0, 60))
  const links: ReportLink[] = [{ kind: 'learn', label: `Search Learn for “${topic.slice(0, 40)}”`, href: `/learn?q=${q}` }]
  if (round === 'coding' || round === 'technical') links.push({ kind: 'practice', label: 'Practise problems', href: `/dashboard/problems?q=${q}` })
  if (round === 'technical' || round === 'hr') links.push({ kind: 'practice', label: 'Interview prep questions', href: '/dashboard/interview-prep' })
  if (round === 'system_design') links.push({ kind: 'learn', label: 'System design posts', href: '/learn?category=system-design' })
  if (patternId) links.push({ kind: 'practice', label: 'Company practice test', href: `/dashboard/company-tests/${encodeURIComponent(patternId)}` })
  return links
}

/** Gap topics across results, most frequent first (case-insensitive dedupe). */
export function topGapTopics(results: readonly QuestionResult[], fallbackTopics: readonly string[], max = 5): string[] {
  const counts = new Map<string, { label: string; n: number }>()
  const add = (t: string) => {
    const label = t.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (label.length < 2) return
    const k = label.toLowerCase()
    const cur = counts.get(k)
    counts.set(k, { label: cur?.label ?? label, n: (cur?.n ?? 0) + 1 })
  }
  for (const r of results) for (const g of r.gaps) add(g)
  if (!counts.size) for (const t of fallbackTopics) add(t)
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, max).map((x) => x.label)
}

/** Questions per round: the admin's count, coding rounds keep at most 3 code problems. */
export function codeProblemCount(round: RoundType, planned: number): number {
  return round === 'coding' ? Math.min(3, Math.max(1, Math.round(planned / 3))) : 0
}

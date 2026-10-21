/**
 * Prompts for the mock interviewer and parsers for its JSON (pure).
 *
 * Three calls per session shape: plan (once), turn (once per answer: score +
 * short reply), report (once). Learner text is fenced as data
 * (lib/ai/untrusted-input) — it can never change the rubric or the scores.
 */
import { fenceUntrusted, untrustedRule } from '@/lib/ai/untrusted-input'
import { ROUND_RUBRIC, cleanScores, shortLine } from './scoring'
import {
  DIMENSIONS, SIM_LANGUAGES, levelLabel, roundLabel, type DimScores, type PlannedQuestion, type QuestionResult, type RoundType,
  type SimLevel, type TestCase,
} from './types'

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const strList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : []

export interface PlanContext {
  role: string
  level: SimLevel
  round: RoundType
  language: string
  companyName: string | null
  /** Company interview steps / tips / sample questions (catalog), short lines. */
  companyNotes: string[]
  /** Exam-pattern section categories (company tests). */
  patternTopics: string[]
  /** Question-bank prompts to draw on (approved items). */
  seedQuestions: string[]
  /** How many talk questions to plan. */
  talkCount: number
}

function languageName(tag: string): string {
  return SIM_LANGUAGES.find((l) => l.id === tag)?.label ?? 'English'
}

function rubricText(round: RoundType): string {
  const r = ROUND_RUBRIC[round]
  return DIMENSIONS.map((d) => `- ${d} (0-5): ${r[d]}`).join('\n')
}

export function interviewerPersona(c: Pick<PlanContext, 'role' | 'level' | 'round' | 'companyName' | 'language'>): string {
  return [
    `You are a friendly but rigorous interviewer${c.companyName ? ` at ${c.companyName}` : ''} running a ${roundLabel(c.round).toLowerCase()} round`,
    `for a ${levelLabel(c.level).toLowerCase()} ${c.role} candidate. This is practice: be encouraging, but score honestly.`,
    `Speak ${languageName(c.language)}. Keep every line you say short (1-2 sentences, under 45 words) — this may be read aloud.`,
    'Never reveal scores during the interview. Never ask for personal data (age, religion, caste, marital status, health, salary history).',
  ].join(' ')
}

export function buildPlanPrompt(c: PlanContext): { system: string; user: string } {
  const system = [
    interviewerPersona(c),
    'Plan the interview. Output strict JSON only.',
  ].join('\n')
  const lines = [
    `Plan exactly ${c.talkCount} interview question${c.talkCount === 1 ? '' : 's'} for this round, easiest first, mixing topics.`,
    c.companyName ? `Company: ${c.companyName}. Match its known interview style.` : 'No specific company: use a typical product-company style.',
    c.companyNotes.length ? `Company notes (public summaries):\n${c.companyNotes.map((n) => `- ${n}`).join('\n')}` : '',
    c.patternTopics.length ? `Topics from the company's test pattern: ${c.patternTopics.join(', ')}.` : '',
    c.seedQuestions.length ? `Question-bank items you may adapt (rephrase for a spoken interview):\n${c.seedQuestions.map((q) => `- ${q}`).join('\n')}` : '',
    c.round === 'hr' ? 'Behavioural questions that invite STAR answers (e.g. "Tell me about a time…").' : '',
    c.round === 'system_design' ? 'Start with one design prompt, then probing questions on requirements, data, scale and failure.' : '',
    c.round === 'coding' ? 'These are the spoken questions around the coding problems: approach, complexity, edge cases, testing. Do not write a full coding problem.' : '',
    'Each question: one sentence a person would say out loud, under 40 words.',
    'Respond as {"greeting": "one short welcome line", "questions": [{"text": "...", "topic": "2-4 word topic", "expected_points": ["3-5 short points a strong answer covers"]}]}',
  ]
  return { system, user: lines.filter(Boolean).join('\n\n') }
}

export function parsePlan(json: unknown, talkCount: number): { greeting: string; questions: Array<Pick<PlannedQuestion, 'text' | 'topic' | 'expected_points'>> } {
  const o = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {}
  const arr = Array.isArray(o.questions) ? o.questions : Array.isArray(json) ? (json as unknown[]) : []
  const seen = new Set<string>()
  const questions = arr
    .map((q) => (q && typeof q === 'object' ? (q as Record<string, unknown>) : {}))
    .map((q) => ({ text: shortLine(str(q.text ?? q.question, 600), 320), topic: str(q.topic, 60) || 'General', expected_points: strList(q.expected_points, 6, 160) }))
    .filter((q) => q.text.length >= 10 && !seen.has(q.text.toLowerCase()) && seen.add(q.text.toLowerCase()))
    .slice(0, talkCount)
  return { greeting: shortLine(str(o.greeting, 400), 220), questions }
}

export interface TurnContext {
  persona: string
  round: RoundType
  question: Pick<PlannedQuestion, 'text' | 'topic' | 'expected_points' | 'kind'>
  /** Earlier exchanges on this same question (main + follow-ups), oldest first. */
  exchanges: Array<{ prompt: string; answer: string }>
  /** The prompt being answered now. */
  prompt: string
  answer: string
  code?: string
  codeLanguage?: string
  codeRun?: { passed: number; total: number; error?: string }
  /** Is a follow-up allowed after this answer? */
  followupAllowed: boolean
  /** Next planned question (so the reply can bridge to it), or null at the end. */
  nextQuestion: string | null
}

export function buildTurnPrompt(c: TurnContext): { system: string; user: string } {
  const system = [
    c.persona,
    `Score the candidate's answer(s) to this question against the rubric:\n${rubricText(c.round)}`,
    'Scores cover everything said on this question so far (main answer and any follow-ups). 0 = missing or wrong, 3 = acceptable, 5 = excellent.',
    untrustedRule(['answer', 'submission']),
    'Output strict JSON only.',
  ].join('\n\n')
  const parts = [
    `Question (${c.question.topic}): ${c.question.text}`,
    c.question.expected_points.length ? `A strong answer covers: ${c.question.expected_points.join('; ')}` : '',
    ...c.exchanges.map((e, i) => `Earlier exchange ${i + 1} — interviewer: ${e.prompt}\n${fenceUntrusted('answer', e.answer, 3000)}`),
    `Interviewer now: ${c.prompt}`,
    fenceUntrusted('answer', c.answer || '(no spoken answer)', 6000),
    c.code ? `Candidate's ${c.codeLanguage || ''} code:\n${fenceUntrusted('submission', c.code, 12_000)}` : '',
    c.codeRun ? `Sandbox run on the sample cases: ${c.codeRun.passed}/${c.codeRun.total} passed${c.codeRun.error ? ` (${c.codeRun.error.slice(0, 160)})` : ''}. Correctness must reflect this.` : '',
    c.followupAllowed
      ? 'If the answer is vague, incomplete or invites a natural probe, give ONE short follow-up question in "follow_up"; otherwise "".'
      : 'No follow-up this time: "follow_up" must be "".',
    c.nextQuestion
      ? `"reply": one short neutral acknowledgement (no praise inflation, no score, no hints) — the next question is added after it automatically.`
      : '"reply": one short closing line thanking the candidate — the interview ends after this.',
    'Respond as {"scores": {"communication": 0-5, "correctness": 0-5, "depth": 0-5, "structure": 0-5}, "feedback": "2 sentences of specific, kind feedback", "model_answer": "a strong answer in under 90 words", "strengths": ["up to 3 short phrases"], "gaps": ["up to 3 short topic phrases to study"], "follow_up": "", "reply": ""}',
  ]
  return { system, user: parts.filter(Boolean).join('\n\n') }
}

export interface ParsedTurn {
  scores: DimScores
  feedback: string
  model_answer: string
  strengths: string[]
  gaps: string[]
  follow_up: string
  reply: string
}

export function parseTurn(json: unknown): ParsedTurn | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  if (!o.scores || typeof o.scores !== 'object') return null
  return {
    scores: cleanScores(o.scores),
    feedback: str(o.feedback, 600),
    model_answer: str(o.model_answer, 1200),
    strengths: strList(o.strengths, 3, 100),
    gaps: strList(o.gaps, 3, 60),
    follow_up: shortLine(str(o.follow_up, 400), 260),
    reply: shortLine(str(o.reply, 300), 200),
  }
}

export function buildReportPrompt(c: { persona: string; round: RoundType; results: Array<QuestionResult & { text: string; topic: string }>; overall: number }): { system: string; user: string } {
  const system = [c.persona, 'Write the end-of-interview feedback for the candidate. Be specific and kind; base it only on the per-question notes. Output strict JSON only.'].join('\n\n')
  const rows = c.results.map((r, i) => `${i + 1}. [${r.topic}] ${r.text}\n   score ${r.score}/100; ${DIMENSIONS.map((d) => `${d} ${r.scores[d]}`).join(', ')}\n   notes: ${r.feedback}\n   gaps: ${r.gaps.join(', ') || '—'}`)
  const user = [
    `Overall score ${c.overall}/100 for a ${roundLabel(c.round).toLowerCase()} round.`,
    rows.join('\n'),
    'Respond as {"summary": "3 sentences", "strengths": ["3-5 short points"], "gaps": [{"topic": "2-4 words", "note": "one sentence: what to work on and how"}], "tips": ["3 short, practical tips for the next interview"]}',
  ].join('\n\n')
  return { system, user }
}

export function parseReport(json: unknown): { summary: string; strengths: string[]; gaps: Array<{ topic: string; note: string }>; tips: string[] } | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const o = json as Record<string, unknown>
  const summary = str(o.summary, 900)
  if (!summary) return null
  const gaps = (Array.isArray(o.gaps) ? o.gaps : [])
    .map((g): Record<string, unknown> => (g && typeof g === 'object' ? (g as Record<string, unknown>) : { topic: g }))
    .map((g) => ({ topic: str(g.topic, 60), note: str(g.note, 300) }))
    .filter((g) => g.topic.length >= 2)
    .slice(0, 5)
  return { summary, strengths: strList(o.strengths, 5, 160), gaps, tips: strList(o.tips, 4, 200) }
}

/** Sample test cases from a bank question / model output (max 4, size-capped). */
export function cleanTestCases(raw: unknown): TestCase[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : {}))
    .filter((t) => typeof t.input === 'string' || typeof t.input === 'number')
    .map((t) => ({ input: String(t.input ?? '').slice(0, 2000), output: String(t.output ?? t.expected ?? '').slice(0, 2000) }))
    .filter((t) => t.output.trim().length > 0)
    .slice(0, 4)
}

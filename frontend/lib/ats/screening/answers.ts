/**
 * Answer extraction + validation per question type, and deterministic
 * knockout checks. Pure — shared by the WhatsApp chat flow (live replies) and
 * by scoring (normalising answers extracted from call transcripts).
 *
 * Knockout = acceptance rule: the answer must satisfy every constraint given
 * (`equals`, `min`, `max`); otherwise the candidate is knocked out. An
 * unanswered knockout question also knocks out (the requirement was not confirmed).
 */
import type { ScreeningQuestion } from './types'

export type Extracted =
  | { ok: true; value: string | number | boolean; display: string }
  | { ok: false; reason: string }

const YES = /^(y|yes|yeah|yep|yup|sure|ok|okay|haan|han|ha|ji|haa|correct|true|affirmative|of course|definitely)\b/i
const NO = /^(n|no|nope|nah|nahi|nahin|na|not really|false|never|negative)\b/i
const WORD_NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90,
}

export function parseNumber(text: string): number | null {
  const t = text.toLowerCase().replace(/(\d),(?=\d)/g, '$1').trim()
  const m = t.match(/(-?\d+(?:\.\d+)?)\s*(k|thousand|l|lakh|lakhs|lac|lacs|cr|crore|crores|m|mn|million)?\b/)
  if (m) {
    const n = parseFloat(m[1])
    const unit = m[2] || ''
    const mult = /^(k|thousand)$/.test(unit) ? 1e3
      : /^(l|lakh|lakhs|lac|lacs)$/.test(unit) ? 1e5
      : /^(cr|crore|crores)$/.test(unit) ? 1e7
      : /^(m|mn|million)$/.test(unit) ? 1e6
      : 1
    return Number.isFinite(n) ? Math.round(n * mult * 100) / 100 : null
  }
  for (const [w, n] of Object.entries(WORD_NUM)) if (new RegExp(`\\b${w}\\b`).test(t)) return n
  return null
}

/** Button ids we send: "yes" / "no" for yes_no, "opt_<index>" for choice. */
export function extractAnswer(q: ScreeningQuestion, input: { text?: string | null; buttonId?: string | null }): Extracted {
  const text = (input.text || '').trim().slice(0, 2000)
  const btn = (input.buttonId || '').trim()
  switch (q.type) {
    case 'yes_no': {
      if (btn === 'yes' || btn === 'no') return { ok: true, value: btn === 'yes', display: btn === 'yes' ? 'Yes' : 'No' }
      if (YES.test(text)) return { ok: true, value: true, display: 'Yes' }
      if (NO.test(text)) return { ok: true, value: false, display: 'No' }
      return { ok: false, reason: 'Please answer yes or no.' }
    }
    case 'number': {
      const n = parseNumber(text)
      if (n === null) return { ok: false, reason: 'Please reply with a number.' }
      return { ok: true, value: n, display: String(n) }
    }
    case 'choice': {
      const opts = q.options || []
      const bi = btn.match(/^opt_(\d+)$/)
      if (bi && opts[Number(bi[1])] !== undefined) return { ok: true, value: opts[Number(bi[1])], display: opts[Number(bi[1])] }
      const lower = text.toLowerCase()
      const exact = opts.find((o) => o.toLowerCase() === lower)
      if (exact) return { ok: true, value: exact, display: exact }
      const idx = /^\d{1,2}$/.test(text) ? Number(text) - 1 : -1
      if (idx >= 0 && idx < opts.length) return { ok: true, value: opts[idx], display: opts[idx] }
      const partial = opts.filter((o) => lower && (lower.includes(o.toLowerCase()) || o.toLowerCase().includes(lower)))
      if (partial.length === 1) return { ok: true, value: partial[0], display: partial[0] }
      return { ok: false, reason: `Please pick one of: ${opts.join(', ')}.` }
    }
    default: {
      if (!text) return { ok: false, reason: 'Please type your answer.' }
      return { ok: true, value: text, display: text }
    }
  }
}

/** Coerce an answer that came from an LLM / voice agent into the question's type (null = unusable). */
export function normaliseAnswer(q: ScreeningQuestion, raw: unknown): string | number | boolean | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (q.type === 'yes_no' && typeof raw === 'boolean') return raw
  if (q.type === 'number' && typeof raw === 'number' && Number.isFinite(raw)) return raw
  const r = extractAnswer(q, { text: String(raw) })
  return r.ok ? r.value : null
}

function eq(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.trim().toLowerCase() === b.trim().toLowerCase()
  if (typeof b === 'boolean' && typeof a === 'string') return (YES.test(a) && b) || (NO.test(a) && !b)
  return a === b
}

/** true = knocked out by this answer. */
export function isKnockedOut(q: ScreeningQuestion, value: unknown): boolean {
  const k = q.knockout
  if (!k || (k.equals === undefined && k.min === undefined && k.max === undefined)) return false
  if (value === null || value === undefined || value === '') return true
  if (k.equals !== undefined && !eq(value, k.equals)) return true
  if (k.min !== undefined || k.max !== undefined) {
    const n = typeof value === 'number' ? value : parseNumber(String(value))
    if (n === null) return true
    if (typeof k.min === 'number' && n < k.min) return true
    if (typeof k.max === 'number' && n > k.max) return true
  }
  return false
}

export function knockouts(questions: ScreeningQuestion[], answers: Record<string, unknown>): string[] {
  return questions.filter((q) => isKnockedOut(q, answers[q.id])).map((q) => q.id)
}

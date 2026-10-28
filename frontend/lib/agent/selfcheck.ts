/**
 * Self-check before the copilot's final answer (pure). Verifies the answer
 * against what the tools actually returned in this conversation:
 *  - ids quoted in the answer must appear in some tool result (no invented ids);
 *  - a turn that only drafted proposals must not claim the change happened;
 *  - when knowledge search returned sources, the answer should name one (citations).
 * Blocking issues trigger one revision; the citation hint is advisory.
 */

export interface SelfCheckInput {
  answer: string
  /** Raw tool-message contents visible to the model (this turn + history). */
  evidence: string[]
  /** Proposals drafted in this turn (nothing has executed yet). */
  proposalsThisTurn: number
  /** Titles of knowledge sources returned in this turn. */
  citationTitles?: string[]
}

export interface SelfCheckIssue {
  kind: 'unverified_id' | 'claims_done' | 'missing_citation'
  detail: string
  blocking: boolean
}

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const OBJECT_ID_RE = /\b[0-9a-f]{24}\b/gi
/** `backticked` tokens that look like ids (letters/digits with - or _ and at least one digit). */
const CODE_ID_RE = /`([A-Za-z0-9][A-Za-z0-9_-]{5,80})`/g

const DONE_RE = /\b(I(?:'ve| have)\s+(?:now\s+)?(?:created|sent|published|released|invited|scheduled|deleted|moved|rejected|saved|emailed|shortlisted|enabled|refunded|approved)|(?:has|have)\s+been\s+(?:created|sent|published|released|scheduled|saved|deleted|moved|rejected|emailed|enabled|refunded|approved)|(?:was|were)\s+(?:successfully\s+)?(?:created|sent|published|released|scheduled|saved|deleted|emailed|refunded|approved)|is\s+now\s+(?:live|published|open|enabled))\b/i
/** Phrases that make a "done" claim conditional ("will be sent once you confirm"). */
const CONDITIONAL_RE = /\b(once you confirm|after you confirm|when you confirm|awaiting (your )?confirmation|draft|proposal|pending|needs your confirmation|after confirmation)\b/i

export function extractIds(answer: string): string[] {
  const out = new Set<string>()
  for (const m of answer.matchAll(UUID_RE)) out.add(m[0].toLowerCase())
  for (const m of answer.matchAll(OBJECT_ID_RE)) out.add(m[0].toLowerCase())
  for (const m of answer.matchAll(CODE_ID_RE)) {
    const v = m[1]
    if (/\d/.test(v) && /[-_]/.test(v)) out.add(v)
  }
  return [...out]
}

export function selfCheckAnswer(input: SelfCheckInput): { ok: boolean; issues: SelfCheckIssue[] } {
  const issues: SelfCheckIssue[] = []
  const answer = input.answer || ''
  const haystack = input.evidence.join('\n').toLowerCase()

  const missing = extractIds(answer).filter((id) => !haystack.includes(id.toLowerCase()))
  if (missing.length) {
    issues.push({ kind: 'unverified_id', detail: `These ids are not in any tool result: ${missing.slice(0, 5).join(', ')}. Look them up or remove them.`, blocking: true })
  }

  if (input.proposalsThisTurn > 0) {
    // Check sentence by sentence so "I drafted X; it will be sent once you confirm" passes.
    const sentences = answer.split(/(?<=[.!?])\s+|\n+/)
    const bad = sentences.find((s) => DONE_RE.test(s) && !CONDITIONAL_RE.test(s))
    if (bad) {
      issues.push({ kind: 'claims_done', detail: `The answer says something already happened ("${bad.trim().slice(0, 120)}"), but this turn only drafted proposals that the admin has not confirmed.`, blocking: true })
    }
  }

  const titles = (input.citationTitles ?? []).filter((t) => t && t.length >= 4)
  if (titles.length && answer.length > 200) {
    const lower = answer.toLowerCase()
    const named = titles.some((t) => lower.includes(t.toLowerCase().slice(0, 40)))
    if (!named) issues.push({ kind: 'missing_citation', detail: 'Name the sources you used (their titles).', blocking: false })
  }
  return { ok: !issues.some((i) => i.blocking), issues }
}

/** The app's note to the model asking for a corrected answer. */
export function revisionNote(issues: SelfCheckIssue[]): string {
  return `[App self-check, not typed by the admin] Your answer needs a fix before it is shown:\n${issues.map((i) => `- ${i.detail}`).join('\n')}\nWrite the corrected final answer now (use tools only if you must look something up). Do not mention this check.`
}

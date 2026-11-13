/**
 * Pure rules for the post-assessment AI debrief (no I/O), shared by
 * app/api/exams/[id]/debrief/* so the three routes agree on what "next",
 * "done" and "skipped" mean. One session per candidate submission.
 */
import type { DebriefSessionDoc } from '@/lib/db/content'

type Session = Pick<DebriefSessionDoc, 'questions' | 'answers' | 'status'>
export type DebriefAnswer = DebriefSessionDoc['answers'][number]

/** The first question with no entry yet (a skipped question has an entry with `skipped: true`). */
export function nextDebriefQuestion(s: Pick<Session, 'questions' | 'answers'>): DebriefSessionDoc['questions'][number] | null {
  const seen = new Set(s.answers.map((a) => a.question_id))
  return s.questions.find((q) => !seen.has(q.id)) ?? null
}

/** Questions the candidate actually wrote an answer to. */
export function writtenAnswerCount(s: Pick<Session, 'answers'>): number {
  return s.answers.filter((a) => !a.skipped && a.text.trim() !== '').length
}

/** Status once every question has an entry: `skipped` when nothing was written, else `completed`. */
export function finalDebriefStatus(answers: DebriefAnswer[]): 'completed' | 'skipped' {
  return writtenAnswerCount({ answers }) > 0 ? 'completed' : 'skipped'
}

/**
 * What to do with an existing session when the candidate opens the debrief
 * again for the same submission:
 *  - `resume`   — still active: carry on at the next question
 *  - `reopen`   — skipped as a whole with questions left: make it active again
 *  - `finished` — nothing left to ask: show the done state (never start a new one)
 */
export function reopenDecision(s: Session): 'resume' | 'reopen' | 'finished' {
  if (!nextDebriefQuestion(s)) return 'finished'
  if (s.status === 'active') return 'resume'
  return s.status === 'skipped' ? 'reopen' : 'finished'
}

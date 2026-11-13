/**
 * Post-assessment debrief rules (lib/assessment/debrief.ts) and the exam
 * setting that turns the debrief on.
 */
import { describe, expect, it } from 'vitest'
import { finalDebriefStatus, nextDebriefQuestion, reopenDecision, writtenAnswerCount } from '@/lib/assessment/debrief'
import { EXAM_EDITABLE_FIELDS, normalizeRetakeFields } from '@/lib/exam-access'

const questions = [
  { id: 'q1', text: 'one', order: 1 },
  { id: 'q2', text: 'two', order: 2 },
  { id: 'q3', text: 'three', order: 3 },
]
const written = (id: string) => ({ question_id: id, text: 'because', answered_at: '2026-01-01T00:00:00Z' })
const skipped = (id: string) => ({ question_id: id, text: '', answered_at: '2026-01-01T00:00:00Z', skipped: true })

describe('debrief rules', () => {
  it('asks the first question with no entry, counting skipped ones as seen', () => {
    expect(nextDebriefQuestion({ questions, answers: [] })?.id).toBe('q1')
    expect(nextDebriefQuestion({ questions, answers: [written('q1'), skipped('q2')] })?.id).toBe('q3')
    expect(nextDebriefQuestion({ questions, answers: [skipped('q2')] })?.id).toBe('q1')
    expect(nextDebriefQuestion({ questions, answers: questions.map((q) => written(q.id)) })).toBeNull()
  })

  it('counts only written answers', () => {
    expect(writtenAnswerCount({ answers: [written('q1'), skipped('q2'), { ...written('q3'), text: '   ' }] })).toBe(1)
  })

  it('ends as completed when anything was written, skipped when nothing was', () => {
    expect(finalDebriefStatus([written('q1'), skipped('q2'), skipped('q3')])).toBe('completed')
    expect(finalDebriefStatus(questions.map((q) => skipped(q.id)))).toBe('skipped')
  })

  it('never restarts a finished debrief, resumes an active one and reopens a skipped one', () => {
    const all = questions.map((q) => written(q.id))
    expect(reopenDecision({ questions, answers: all, status: 'completed' })).toBe('finished')
    expect(reopenDecision({ questions, answers: all, status: 'active' })).toBe('finished')
    expect(reopenDecision({ questions, answers: [written('q1')], status: 'active' })).toBe('resume')
    expect(reopenDecision({ questions, answers: [], status: 'skipped' })).toBe('reopen')
    expect(reopenDecision({ questions, answers: [written('q1')], status: 'completed' })).toBe('finished')
  })
})

describe('debrief exam setting', () => {
  it('is an editable exam field and is stored as a strict boolean', () => {
    expect(EXAM_EDITABLE_FIELDS).toContain('enable_ai_debrief')
    const on: Record<string, unknown> = { enable_ai_debrief: true }
    const junk: Record<string, unknown> = { enable_ai_debrief: 'yes' }
    normalizeRetakeFields(on); normalizeRetakeFields(junk)
    expect(on.enable_ai_debrief).toBe(true)
    expect(junk.enable_ai_debrief).toBe(false)
  })
})

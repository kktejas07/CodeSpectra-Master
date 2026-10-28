import { describe, expect, it } from 'vitest'
import {
  advanceSections,
  candidateSectionsView,
  editableQuestionIds,
  enterSection,
  initSectionsState,
  mergeSectionAnswers,
  normalizeSections,
  parseSectionsState,
  resolveSections,
  sectionDeadlineMs,
  sectionScores,
  visibleQuestionIds,
  type ExamSection,
} from '@/lib/exam-sections'
import { candidateExamView, sectionsAtSubmit, EXAM_SUBMIT_GRACE_MS } from '@/lib/exam-access'
import { isScoredType } from '@/lib/question-types'

const MIN = 60_000
const GRACE = EXAM_SUBMIT_GRACE_MS
const t0 = Date.parse('2026-10-19T10:00:00.000Z')

const sections: ExamSection[] = [
  { id: 'code', title: 'Coding', time_limit_minutes: 20, lock_after_leave: false, question_ids: ['q1', 'q2'] },
  { id: 'mcq', title: 'MCQ', time_limit_minutes: 10, lock_after_leave: true, question_ids: ['q3'] },
  { id: 'written', title: 'Written', time_limit_minutes: null, lock_after_leave: false, question_ids: ['q4'] },
]
const overall = t0 + 60 * MIN

describe('normalizeSections / resolveSections', () => {
  it('whitelists fields, caps values and gives each question to one section', () => {
    const out = normalizeSections([
      { id: 'a', title: '  Coding ', time_limit_minutes: 9999, lock_after_leave: 'yes', question_ids: ['q1', 'q1', 'q2'], $where: 'x', answer: 'leak' },
      { id: 'a', title: '', time_limit_minutes: 0, question_ids: ['q2', 'q3', 'nope'] },
    ], ['q1', 'q2', 'q3'])
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ id: 'a', title: 'Coding', time_limit_minutes: 600, lock_after_leave: false, question_ids: ['q1', 'q2'] })
    expect(out[1].id).not.toBe('a')
    expect(out[1].title).toBe('Section 2')
    expect(out[1].time_limit_minutes).toBeNull()
    expect(out[1].question_ids).toEqual(['q3'])
    expect(Object.keys(out[0])).not.toContain('answer')
  })

  it('a test without sections resolves to [] (single implicit section)', () => {
    expect(resolveSections({ questionList: [{ id: 'q1' }] })).toEqual([])
    expect(resolveSections({ questionList: [{ id: 'q1' }], sections: [] })).toEqual([])
  })

  it('unassigned questions go to the last section; empty sections are dropped', () => {
    const exam = {
      questionList: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }],
      sections: [{ id: 's1', title: 'A', question_ids: ['q1'] }, { id: 's2', title: 'B', question_ids: [] }, { id: 's3', title: 'C', question_ids: ['q2'] }],
    }
    const r = resolveSections(exam)
    expect(r.map((s) => s.id)).toEqual(['s1', 's3'])
    expect(r[1].question_ids).toEqual(['q2', 'q3'])
  })
})

describe('section clocks', () => {
  it('section deadline = start + limit, capped at the attempt deadline; shared sections end with the test', () => {
    expect(sectionDeadlineMs({ time_limit_minutes: 20 }, t0, overall)).toBe(t0 + 20 * MIN)
    expect(sectionDeadlineMs({ time_limit_minutes: 90 }, t0, overall)).toBe(overall)
    expect(sectionDeadlineMs({ time_limit_minutes: null }, t0, overall)).toBe(overall)
    expect(sectionDeadlineMs({ time_limit_minutes: null }, t0, null)).toBeNull()
  })

  it('starts in the first section with its clock running', () => {
    const s = initSectionsState(sections, t0, overall)
    expect(s.current).toBe('code')
    expect(s.sections.code.deadline).toBe(new Date(t0 + 20 * MIN).toISOString())
    expect(s.sections.mcq).toBeUndefined()
    expect([...visibleQuestionIds(sections, s)]).toEqual(['q1', 'q2'])
  })

  it('stays open inside the grace window, then moves on automatically (next clock starts at the old deadline)', () => {
    const s = initSectionsState(sections, t0, overall)
    const dl = t0 + 20 * MIN
    expect(advanceSections(s, sections, dl + GRACE - 1, overall, GRACE).state.current).toBe('code')
    const late = advanceSections(s, sections, dl + GRACE + 1, overall, GRACE)
    expect(late.changed).toBe(true)
    expect(late.state.current).toBe('mcq')
    expect(late.state.sections.code.closed_reason).toBe('time')
    expect(late.state.sections.mcq.started_at).toBe(new Date(dl).toISOString())
    expect(late.state.sections.mcq.deadline).toBe(new Date(dl + 10 * MIN).toISOString())
  })

  it('a candidate away for a long time skips through every expired section', () => {
    const s = initSectionsState(sections, t0, overall)
    const r = advanceSections(s, sections, t0 + 45 * MIN, overall, GRACE).state
    expect(r.sections.code.closed_reason).toBe('time')
    expect(r.sections.mcq.closed_reason).toBe('time')
    expect(r.current).toBe('written')
    // written shares the overall time
    expect(r.sections.written.deadline).toBe(new Date(overall).toISOString())
  })

  it('leaving a lock-after-leave section locks it; it cannot be re-entered', () => {
    let s = initSectionsState(sections, t0, overall)
    const a = enterSection(s, sections, 'mcq', t0 + 5 * MIN, overall, GRACE)
    expect(a.ok).toBe(true)
    s = a.state
    expect(s.sections.code.closed_at).toBeUndefined() // Coding doesn't lock
    const b = enterSection(s, sections, 'written', t0 + 6 * MIN, overall, GRACE)
    expect(b.ok).toBe(true)
    expect(b.state.sections.mcq.closed_reason).toBe('left')
    const back = enterSection(b.state, sections, 'mcq', t0 + 7 * MIN, overall, GRACE)
    expect(back.ok).toBe(false)
    if (!back.ok) expect(back.error).toMatch(/locked/i)
    // A non-locking section can be revisited while its own clock still runs…
    expect(enterSection(b.state, sections, 'code', t0 + 7 * MIN, overall, GRACE).ok).toBe(true)
    // …but not after it ran out (the clock kept running while away).
    const expired = enterSection(b.state, sections, 'code', t0 + 20 * MIN + GRACE + 1, overall, GRACE)
    expect(expired.ok).toBe(false)
    if (!expired.ok) expect(expired.error).toMatch(/time is up/i)
  })

  it('re-entering a section never restarts its clock', () => {
    let s = initSectionsState(sections, t0, overall)
    s = enterSection(s, sections, 'written', t0 + 1 * MIN, overall, GRACE).state
    const back = enterSection(s, sections, 'code', t0 + 2 * MIN, overall, GRACE)
    expect(back.ok).toBe(true)
    expect(back.state.sections.code.started_at).toBe(new Date(t0).toISOString())
  })

  it('only the current open section is editable; other answers keep the stored value', () => {
    let s = initSectionsState(sections, t0, overall)
    expect([...editableQuestionIds(s, sections)]).toEqual(['q1', 'q2'])
    s = enterSection(s, sections, 'mcq', t0 + 1 * MIN, overall, GRACE).state
    const merged = mergeSectionAnswers({ q1: 'old', q3: '' }, { q1: 'new', q3: 'B', q4: 'sneaky' }, editableQuestionIds(s, sections))
    expect(merged).toEqual({ q1: 'old', q3: 'B' })
  })

  it('a malformed stored state is rejected (the attempt re-initialises)', () => {
    expect(parseSectionsState(null, sections)).toBeNull()
    expect(parseSectionsState({ current: 'gone', sections: {} }, sections)).toBeNull()
    const ok = parseSectionsState({ current: 'mcq', sections: { mcq: { started_at: 'x', $set: 1 } }, v: 3 }, sections)
    expect(ok?.current).toBe('mcq')
    expect(ok?.v).toBe(3)
    expect(Object.keys(ok!.sections.mcq)).toEqual(['started_at'])
  })

  it('candidate view lists status per section', () => {
    const s = enterSection(initSectionsState(sections, t0, overall), sections, 'mcq', t0 + MIN, overall, GRACE).state
    expect(candidateSectionsView(sections, s).map((x) => x.status)).toEqual(['open', 'active', 'upcoming'])
  })
})

describe('submit with sections', () => {
  const exam = {
    id: 'e1',
    duration: 60,
    questionList: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }],
    sections,
  }
  it('closed sections keep the server draft; the browser only counts for the current section', () => {
    const state = enterSection(initSectionsState(sections, t0, overall), sections, 'mcq', t0 + MIN, overall, GRACE).state
    const draft = { answers: { q1: 'saved code', q3: 'A' }, sections_state: state }
    const r = sectionsAtSubmit(exam, draft, { q1: 'edited later', q3: 'C', q4: 'not entered' }, overall, t0 + 2 * MIN)
    expect(r?.answers).toEqual({ q1: 'saved code', q3: 'C' })
  })
  it('tests without sections are untouched', () => {
    expect(sectionsAtSubmit({ id: 'e2', questionList: [{ id: 'q1' }] }, null, { q1: 'x' }, null)).toBeNull()
  })
})

describe('candidate projection with sections', () => {
  it('keeps only whitelisted section fields and never answer keys', () => {
    const view = candidateExamView({
      _id: 'x',
      questionList: [{ id: 'q1', title: 'T', answer: 'secret', correct_answer: 'secret' }],
      sections: [{ id: 's1', title: 'A', question_ids: ['q1'], answer_key: 'secret', rubric: 'r' }],
    })
    expect(JSON.stringify(view)).not.toContain('secret')
    expect((view.sections as ExamSection[])[0]).toEqual({ id: 's1', title: 'A', time_limit_minutes: null, lock_after_leave: false, question_ids: ['q1'] })
  })
  it('no sections key for tests without sections', () => {
    expect('sections' in candidateExamView({ questionList: [{ id: 'q1' }], sections: [] })).toBe(false)
  })
})

describe('sectionScores', () => {
  it('sums awarded points (else full points when correct) per section; unscored types are ignored', () => {
    const qs = [
      { id: 'q1', type: 'coding', points: 20 },
      { id: 'q2', type: 'mcq', points: 10 },
      { id: 'q3', type: 'mcq', points: 10 },
      { id: 'q4', type: 'likert', points: 5 },
    ]
    const details = [
      { qId: 'q1', correct: true, points: 20, awarded: 12 },
      { qId: 'q2', correct: true, points: 10 },
      { qId: 'q3', correct: false, points: 10 },
      { qId: 'q4', correct: false, points: 5 },
    ]
    const r = sectionScores(sections, qs, details, isScoredType)
    expect(r[0]).toMatchObject({ id: 'code', score: 22, max: 30, percent: 73 })
    expect(r[1]).toMatchObject({ id: 'mcq', score: 0, max: 10, percent: 0 })
    expect(r[2]).toMatchObject({ id: 'written', max: 0, percent: null })
  })
})

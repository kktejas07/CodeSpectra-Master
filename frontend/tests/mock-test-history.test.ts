import { describe, expect, it } from 'vitest'
import {
  buildHistoryFilter,
  buildHistorySort,
  parseHistoryQuery,
  reviewQuestions,
  timeTakenSeconds,
  toHistoryRow,
} from '@/app/api/mock-tests/_history'
import type { MockTestSessionDoc } from '@/app/api/mock-tests/_sessions'
import { draftToResumeText, parseResumeRef } from '@/app/api/interviews/ai-mock/_resume'

const NOW = Date.parse('2026-10-19T12:00:00Z')

const doc = (over: Partial<MockTestSessionDoc> = {}): MockTestSessionDoc => ({
  id: 's1',
  user_id: 'u1',
  company: 'TCS',
  role: 'QA Engineer',
  difficulty: 'basic',
  questions: [
    { id: 'q1', question: 'A?', options: ['a', 'b', 'c', 'd'], correctIndex: 1, explanation: 'b' },
    { id: 'q2', question: 'B?', options: ['a', 'b', 'c', 'd'], correctIndex: 2, explanation: 'c' },
  ],
  created_at: '2026-10-19T10:00:00Z',
  submitted_at: null,
  ...over,
})

describe('mock test history query', () => {
  it('parses and clamps params', () => {
    expect(parseHistoryQuery(new URLSearchParams('page=0&page_size=999&status=weird&sort=score&order=asc&company=%20TCS%20'))).toEqual({
      page: 1, pageSize: 50, company: 'TCS', role: null, status: 'all', sort: 'score', order: 'asc',
    })
    expect(parseHistoryQuery(new URLSearchParams('')).pageSize).toBe(10)
  })

  it('always scopes to the caller and never lists abandoned attempts', () => {
    const all = buildHistoryFilter('u1', { company: 'TCS', role: null, status: 'all' }, NOW)
    expect(all.user_id).toBe('u1')
    expect(all.company).toBe('TCS')
    const open = buildHistoryFilter('u1', { company: null, role: null, status: 'in_progress' }, NOW)
    expect(open.abandoned_at).toEqual({ $exists: false })
    expect(open.submitted_at).toBeNull()
    expect(open.created_at).toEqual({ $gte: '2026-10-18T12:00:00.000Z' })
    expect(buildHistoryFilter('u1', { company: null, role: null, status: 'submitted' }, NOW).submitted_at).toEqual({ $ne: null })
  })

  it('sorts by date or score with a stable tiebreak', () => {
    expect(buildHistorySort({ sort: 'date', order: 'desc' })).toEqual({ created_at: -1, id: 1 })
    expect(buildHistorySort({ sort: 'score', order: 'asc' })).toEqual({ percentage: 1, created_at: -1, id: 1 })
  })
})

describe('mock test history rows', () => {
  it('measures time from the first autosaved start, else creation', () => {
    expect(timeTakenSeconds(doc())).toBeNull()
    expect(timeTakenSeconds(doc({ submitted_at: '2026-10-19T10:10:00Z' }))).toBe(600)
    expect(timeTakenSeconds(doc({
      submitted_at: '2026-10-19T10:10:00Z',
      progress: { answers: {}, index: 0, started_at: Date.parse('2026-10-19T10:05:00Z'), saved_at: '' },
    }))).toBe(300)
  })

  it('hides score and answer key until submitted', () => {
    const open = doc()
    expect(toHistoryRow(open)).toMatchObject({ status: 'in_progress', score: null, percentage: null, total: 2 })
    expect(reviewQuestions(open)).toBeNull()

    const done = doc({ submitted_at: '2026-10-19T10:10:00Z', answers: { '0': 1 }, score: 1, total: 2, percentage: 50 })
    expect(toHistoryRow(done)).toMatchObject({ status: 'submitted', score: 1, percentage: 50 })
    expect(reviewQuestions(done)).toEqual([
      expect.objectContaining({ index: 0, chosen_index: 1, correct_index: 1, correct: true }),
      expect.objectContaining({ index: 1, chosen_index: null, correct_index: 2, correct: false }),
    ])
  })
})

describe('ai mock interview resume selection', () => {
  it('accepts only well-formed draft/uploaded references', () => {
    expect(parseResumeRef(undefined)).toBeUndefined()
    expect(parseResumeRef({ kind: 'draft', id: 'abc-123' })).toEqual({ kind: 'draft', id: 'abc-123' })
    expect(parseResumeRef({ kind: 'uploaded', id: 'x' })).toEqual({ kind: 'uploaded', id: 'x' })
    expect(parseResumeRef({ kind: 'other', id: 'x' })).toBeNull()
    expect(parseResumeRef({ kind: 'draft', id: { $ne: null } })).toBeNull()
    expect(parseResumeRef('draft')).toBeNull()
  })

  it('turns a builder draft into resume text without email or phone', () => {
    const text = draftToResumeText({
      personal: { fullName: 'Asha Rao', email: 'a@x.com', phone: '999', location: 'Hyderabad', linkedin: '', portfolio: '' },
      summary: 'Backend engineer.',
      experience: [{ id: 'e1', company: 'Acme', role: 'SDE', dates: '2022–2024', description: 'Built APIs.' }],
      education: [{ id: 'd1', institution: 'JNTU', degree: 'B.Tech', dates: '2022' }],
      skills: 'Go, SQL',
    })
    expect(text).toContain('Asha Rao')
    expect(text).toContain('SDE at Acme (2022–2024)')
    expect(text).toContain('B.Tech, JNTU (2022)')
    expect(text).toContain('Go, SQL')
    expect(text).not.toContain('a@x.com')
    expect(text).not.toContain('999')
  })
})

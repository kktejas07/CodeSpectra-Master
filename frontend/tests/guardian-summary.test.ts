import { describe, expect, it } from 'vitest'
import {
  buildGuardianSummary, checkGuardianContact, guardianTemplateParams, isMinorProfile, normalizeShare, renderGuardianEmail, reportDue, summaryLines,
  DEFAULT_SHARE, type SummaryInput,
} from '@/lib/guardian/summary'

const week = { start: '2026-10-19', end: '2026-10-25' }
const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  week,
  share: DEFAULT_SHARE,
  planMinutesDone: 90,
  waAnswers: 6,
  acceptedSubmissions: 4,
  tests: [
    { title: 'TCS NQT mock', score: 40, max_score: 50, at: '2026-10-22T10:00:00Z' },
    { title: 'DSA quiz', score: 6, max_score: 10, at: '2026-10-24T10:00:00Z' },
    { title: 'Older test', score: 5, max_score: 10, at: '2026-10-05T10:00:00Z' },
  ],
  streak: { current: 5, longest: 9 },
  plan: { planned: 10, done: 7 },
  drives: [{ title: 'Infosys drive', start_at: '2026-11-02T04:30:00Z' }],
  ...over,
})

describe('buildGuardianSummary', () => {
  it('summarises the week from aggregates', () => {
    const s = buildGuardianSummary(input())
    expect(s.practice).toEqual({ minutes: 96, sessions: 10 })
    expect(s.tests).toEqual({ count: 2, average_percent: 70, items: [{ title: 'TCS NQT mock', percent: 80, date: '2026-10-22' }, { title: 'DSA quiz', percent: 60, date: '2026-10-24' }] })
    expect(s.score_trend).toEqual({ direction: 'up', this_week: 70, before: 50 })
    expect(s.streak).toEqual({ current: 5, longest: 9 })
    expect(s.study_plan).toEqual({ done: 7, planned: 10, percent: 70 })
    expect(s.drives).toEqual([{ title: 'Infosys drive', date: '2026-11-02' }])
    expect(s.empty).toBe(false)
  })
  it('drops everything the learner did not share', () => {
    const s = buildGuardianSummary(input({ share: normalizeShare({ tests: false, score_trend: false, drives: false }) }))
    expect(s.tests).toBeUndefined()
    expect(s.score_trend).toBeUndefined()
    expect(s.drives).toBeUndefined()
    expect(s.practice).toBeDefined()
  })
  it('never carries answers or proctoring data even if present in the input', () => {
    const dirty = input({ tests: [{ title: 'T', score: 1, max_score: 2, at: '2026-10-20T00:00:00Z', answers: { q1: 'secret' }, snapshots: ['s3://x'] } as never] })
    const json = JSON.stringify(buildGuardianSummary(dirty))
    expect(json).not.toContain('secret')
    expect(json).not.toContain('s3://')
  })
  it('trend is none without earlier results; steady within 5 points', () => {
    expect(buildGuardianSummary(input({ tests: [{ title: 'A', score: 7, max_score: 10, at: '2026-10-20T00:00:00Z' }] })).score_trend?.direction).toBe('none')
    expect(buildGuardianSummary(input({ tests: [{ title: 'A', score: 7, max_score: 10, at: '2026-10-20T00:00:00Z' }, { title: 'B', score: 68, max_score: 100, at: '2026-10-01T00:00:00Z' }] })).score_trend?.direction).toBe('steady')
  })
  it('an inactive week with nothing shared is empty', () => {
    const s = buildGuardianSummary(input({ planMinutesDone: 0, waAnswers: 0, acceptedSubmissions: 0, tests: [], streak: { current: 0, longest: 3 }, plan: null, drives: [] }))
    expect(s.empty).toBe(true)
  })
})

describe('rendering', () => {
  it('renders the email in the guardian language with an unsubscribe link', () => {
    const s = buildGuardianSummary(input())
    for (const [l, re] of [['hi', /[ऀ-ॿ]/], ['te', /[ఀ-౿]/]] as const) {
      const m = renderGuardianEmail(s, l, { learnerName: 'Asha', unsubscribeUrl: 'https://x.test/guardian/unsubscribe?l=a&t=b' })
      expect(m.subject).toMatch(re)
      expect(m.html).toMatch(re)
      expect(m.html).toContain(`lang="${l}"`)
      expect(m.html).toContain('https://x.test/guardian/unsubscribe?l=a&amp;t=b')
      expect(m.text).toContain('https://x.test/guardian/unsubscribe?l=a&t=b')
      expect(m.html).not.toMatch(/guardian\.\w+/)
    }
  })
  it('escapes learner-controlled text', () => {
    const s = buildGuardianSummary(input({ tests: [{ title: '<script>x</script>', score: 1, max_score: 2, at: '2026-10-20T00:00:00Z' }] }))
    const m = renderGuardianEmail(s, 'en', { learnerName: '<b>A</b>', unsubscribeUrl: 'https://x.test/u' })
    expect(m.html).not.toContain('<script>')
    expect(m.html).not.toContain('<b>A</b>')
  })
  it('lines and template params follow the share settings', () => {
    const s = buildGuardianSummary(input({ share: normalizeShare({ practice_time: false, study_plan: false }) }))
    const lines = summaryLines(s, 'en')
    expect(lines.join(' ')).not.toMatch(/minutes of practice/)
    const p = guardianTemplateParams(s, 'Asha')
    expect(p).toHaveLength(6)
    expect(p[2]).toBe('—')
    expect(p[5]).toBe('—')
    expect(p.every((x) => x.length <= 60)).toBe(true)
  })
})

describe('rules', () => {
  const now = new Date('2026-10-23T00:00:00Z')
  it('minor detection from the profile', () => {
    expect(isMinorProfile({ date_of_birth: '2010-05-01' }, now)).toBe(true)
    expect(isMinorProfile({ dob: '2008-10-22' }, now)).toBe(false)
    expect(isMinorProfile({ dob: '2008-10-24' }, now)).toBe(true)
    expect(isMinorProfile({ birth_year: 2012 }, now)).toBe(true)
    expect(isMinorProfile({ declared_minor: true }, now)).toBe(true)
    expect(isMinorProfile({}, now)).toBe(false)
    expect(isMinorProfile(null, now)).toBe(false)
  })
  it('guardian contact rules', () => {
    expect(checkGuardianContact({}, {}, false)).toEqual({ ok: false, code: 'guardian_contact_required' })
    expect(checkGuardianContact({ email: 'bad' }, {}, false)).toEqual({ ok: false, code: 'guardian_email_invalid' })
    expect(checkGuardianContact({ email: 'mum@example.com' }, {}, true)).toEqual({ ok: false, code: 'guardian_minor_needs_both' })
    expect(checkGuardianContact({ email: 'Me@Example.com' }, { email: 'me@example.com' }, false)).toEqual({ ok: false, code: 'guardian_contact_is_learner' })
    expect(checkGuardianContact({ phoneKey: '919876543210' }, { phoneKeys: ['919876543210'] }, false)).toEqual({ ok: false, code: 'guardian_contact_is_learner' })
    expect(checkGuardianContact({ email: 'mum@example.com', phoneKey: '919000000000' }, { email: 'me@example.com', phoneKeys: ['919876543210'] }, true)).toEqual({ ok: true })
  })
  it('weekly report is due Sunday evening once per ISO week', () => {
    const sunEve = new Date('2026-10-25T13:00:00Z') // 18:30 IST
    const due = reportDue(sunEve, 'Asia/Kolkata', null)
    expect(due).toMatchObject({ due: true, start: '2026-10-19', end: '2026-10-25' })
    expect(reportDue(sunEve, 'Asia/Kolkata', due.week).due).toBe(false)
    expect(reportDue(new Date('2026-10-25T06:00:00Z'), 'Asia/Kolkata', null).due).toBe(false)
    expect(reportDue(new Date('2026-10-24T13:00:00Z'), 'Asia/Kolkata', null).due).toBe(false)
  })
})

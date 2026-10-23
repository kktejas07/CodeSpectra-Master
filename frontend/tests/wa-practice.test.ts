import { describe, expect, it } from 'vitest'
import {
  answerReplyId, canResendOptin, duePrompt, gradeReply, inSession, isoWeekKey, matchDomain, normalizePracticeSettings, optionFromText,
  parseCommand, parseReplyId, questionFilter, questionsLeftToday, renderQuestion, sendHourAllowed, DEFAULT_PRACTICE_SETTINGS,
  type WaPracticeEnrollment,
} from '@/lib/wa-practice/logic'

const labels = { header: 'Java · Easy', replyHint: 'Reply with your answer.', choose: 'Choose' }

function enrollment(over: Partial<WaPracticeEnrollment> = {}): WaPracticeEnrollment {
  return {
    id: 'e1', user_id: 'u1', phone: '+919876543210', phone_key: '919876543210', status: 'active', domain: 'java', level: 'easy', locale: 'en',
    send_hour: 18, timezone: 'Asia/Kolkata', daily_cap: 3, consent: { text: 'x', at: '2026-10-01T00:00:00Z', via: 'app', locale: 'en' },
    confirmed: { at: '2026-10-01T00:05:00Z', via: 'button' }, optin_sent: null, last_daily_day: null, last_mock_week: null, day_count: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...over,
  }
}

describe('commands', () => {
  it('parses keywords case-insensitively', () => {
    expect(parseCommand({ text: 'STOP' })).toEqual({ kind: 'stop' })
    expect(parseCommand({ text: 'stop please' })).toEqual({ kind: 'stop' })
    expect(parseCommand({ text: 'Start' })).toEqual({ kind: 'start' })
    expect(parseCommand({ text: 'join' })).toEqual({ kind: 'join' })
    expect(parseCommand({ text: 'LANG hi' })).toEqual({ kind: 'lang', locale: 'hi' })
    expect(parseCommand({ text: 'lang telugu' })).toEqual({ kind: 'lang', locale: 'te' })
    expect(parseCommand({ text: 'lang xx' })).toEqual({ kind: 'lang', locale: null })
    expect(parseCommand({ text: 'LEVEL Hard' })).toEqual({ kind: 'level', level: 'hard' })
    expect(parseCommand({ text: 'level' })).toEqual({ kind: 'level', level: null })
    expect(parseCommand({ text: 'TOPIC sql' })).toEqual({ kind: 'topic', query: 'sql' })
    expect(parseCommand({ text: 'topic' })).toEqual({ kind: 'topic', query: null })
    expect(parseCommand({ text: 'next' })).toEqual({ kind: 'next' })
    expect(parseCommand({ text: 'MOCK' })).toEqual({ kind: 'mock' })
    expect(parseCommand({ text: 'help' })).toEqual({ kind: 'help' })
  })
  it('anything else is an answer', () => {
    expect(parseCommand({ text: ' B ' })).toEqual({ kind: 'answer', deliveryId: null, optionIndex: null, text: 'B' })
  })
  it('reply ids we created win over text; others are ignored', () => {
    expect(parseCommand({ replyId: answerReplyId('abcdef123', 2), text: 'whatever' })).toEqual({ kind: 'answer', deliveryId: 'abcdef123', optionIndex: 2, text: '' })
    expect(parseReplyId('wp:join')).toEqual({ kind: 'join' })
    expect(parseReplyId('wp:t:java')).toEqual({ kind: 'topic_pick', domain: 'java' })
    expect(parseReplyId('wp:l:medium')).toEqual({ kind: 'level', level: 'medium' })
    expect(parseReplyId('wp:a:$bad:1')).toBeNull()
    expect(parseReplyId('sc:yes')).toBeNull()
  })
  it('matches a domain from TOPIC words', () => {
    const ds = [{ id: 'java', label: 'Java' }, { id: 'data_science', label: 'Data science' }, { id: 'sql', label: 'SQL' }]
    expect(matchDomain('Java', ds)).toBe('java')
    expect(matchDomain('data science', ds)).toBe('data_science')
    expect(matchDomain('science', ds)).toBe('data_science')
    expect(matchDomain('cobol', ds)).toBeNull()
  })
})

describe('rendering', () => {
  it('short options become reply buttons with the option text', () => {
    const r = renderQuestion({ id: 'q', type: 'true_false', question: 'Is Java compiled?' }, 'd1abcdef', ['True', 'False'], labels)
    expect(r.mode).toBe('buttons')
    if (r.mode === 'buttons') expect(r.buttons).toEqual([{ id: 'wp:a:d1abcdef:0', title: 'True' }, { id: 'wp:a:d1abcdef:1', title: 'False' }])
  })
  it('four options become a lettered list with the options in the body', () => {
    const r = renderQuestion({ id: 'q', type: 'mcq', question: 'Pick one' }, 'd1abcdef', ['Alpha', 'Beta', 'Gamma', 'Delta'], labels)
    expect(r.mode).toBe('list')
    if (r.mode === 'list') {
      expect(r.rows.map((x) => x.title)).toEqual(['A', 'B', 'C', 'D'])
      expect(r.body).toContain('D. Delta')
    }
  })
  it('long options with ≤3 choices use letter buttons', () => {
    const r = renderQuestion({ id: 'q', type: 'mcq', question: 'Pick' }, 'd1abcdef', ['A very long option text here', 'Another long option text', 'Third one is long too'], labels)
    expect(r.mode).toBe('buttons')
    if (r.mode === 'buttons') expect(r.buttons.map((b) => b.title)).toEqual(['A', 'B', 'C'])
  })
  it('numeric questions ask for a text reply and stay within WhatsApp limits', () => {
    const r = renderQuestion({ id: 'q', type: 'numeric', question: 'x'.repeat(3000) }, 'd1abcdef', [], labels)
    expect(r.mode).toBe('text')
    expect(r.body.length).toBeLessThanOrEqual(1024)
    expect(r.body).toContain('Reply with your answer.')
  })
})

describe('grading', () => {
  const mcq = { id: 'q', type: 'mcq', question: 'Q', options: ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'], answer: 'C' }
  it('maps letters, numbers and option text', () => {
    expect(optionFromText('c', mcq.options)).toBe(2)
    expect(optionFromText('3', mcq.options)).toBe(2)
    expect(optionFromText('b)', mcq.options)).toBe(1)
    expect(optionFromText('O(log n)', mcq.options)).toBe(2)
    expect(optionFromText('Z', mcq.options)).toBeNull()
  })
  it('grades with the shared objective grader', () => {
    expect(gradeReply(mcq, mcq.options, { optionIndex: 2, text: '' })).toEqual({ correct: true, given: 'O(log n)', correctAnswer: 'O(log n)' })
    expect(gradeReply(mcq, mcq.options, { optionIndex: null, text: 'a' })).toMatchObject({ correct: false, correctAnswer: 'O(log n)' })
    expect(gradeReply(mcq, mcq.options, { optionIndex: null, text: 'no idea' })).toBeNull()
  })
  it('numeric honours tolerance; short answers are normalised', () => {
    expect(gradeReply({ id: 'n', type: 'numeric', question: 'Q', answer: '3.14', tolerance: 0.01 }, [], { optionIndex: null, text: '3.141' })?.correct).toBe(true)
    expect(gradeReply({ id: 'n', type: 'numeric', question: 'Q', answer: '3.14' }, [], { optionIndex: null, text: '4' })?.correct).toBe(false)
    expect(gradeReply({ id: 's', type: 'short_answer', question: 'Q', answer: 'Hash Map' }, [], { optionIndex: null, text: '  hash   map ' })?.correct).toBe(true)
  })
})

describe('selection', () => {
  it('only approved, active, WhatsApp-friendly rows of the domain + level', () => {
    const f = questionFilter({ domain: 'java', level: 'medium' }, { id: 'java', kind: 'skill' }, ['q1']) as { $and: Record<string, unknown>[] }
    expect(f.$and).toContainEqual({ is_active: true })
    expect(f.$and).toContainEqual({ review_status: { $ne: 'draft' } })
    expect(f.$and).toContainEqual({ difficulty: 'Medium' })
    expect(f.$and).toContainEqual({ id: { $nin: ['q1'] } })
    expect(JSON.stringify(f)).toContain('"domain":"java"')
    expect(JSON.stringify(f)).toContain('"mcq"')
    expect(JSON.stringify(f)).not.toContain('"coding"')
  })
})

describe('scheduling', () => {
  const s = DEFAULT_PRACTICE_SETTINGS
  // 2026-10-21 is a Wednesday; 12:30 UTC = 18:00 IST.
  const wed1800 = new Date('2026-10-21T12:30:00Z')
  it('daily prompt at the learner hour, once per local day', () => {
    expect(duePrompt(enrollment(), wed1800, s)).toEqual({ kind: 'daily', day: '2026-10-21', week: isoWeekKey('2026-10-21') })
    expect(duePrompt(enrollment({ last_daily_day: '2026-10-21' }), wed1800, s)).toBeNull()
    expect(duePrompt(enrollment({ send_hour: 9 }), wed1800, s)).toBeNull()
  })
  it('never for pending / stopped / unconfirmed learners', () => {
    expect(duePrompt(enrollment({ status: 'pending' }), wed1800, s)).toBeNull()
    expect(duePrompt(enrollment({ status: 'stopped' }), wed1800, s)).toBeNull()
    expect(duePrompt(enrollment({ confirmed: null }), wed1800, s)).toBeNull()
  })
  it('respects the daily cap', () => {
    expect(duePrompt(enrollment({ day_count: { day: '2026-10-21', count: 3 } }), wed1800, s)).toBeNull()
    expect(questionsLeftToday(enrollment({ day_count: { day: '2026-10-20', count: 3 } }), '2026-10-21')).toBe(3)
  })
  it('weekly mock on mock day (Sunday) when the cap allows 5', () => {
    const sun = new Date('2026-10-25T12:30:00Z')
    expect(duePrompt(enrollment({ daily_cap: 5 }), sun, s)?.kind).toBe('mock')
    expect(duePrompt(enrollment({ daily_cap: 3 }), sun, s)?.kind).toBe('daily')
    expect(duePrompt(enrollment({ daily_cap: 5, last_mock_week: isoWeekKey('2026-10-25') }), sun, s)?.kind).toBe('daily')
  })
  it('quiet hours block sending and choosing those hours', () => {
    const late = enrollment({ send_hour: 22 })
    expect(duePrompt(late, new Date('2026-10-21T16:30:00Z'), s)).toBeNull()
    expect(sendHourAllowed(22, s)).toBe(false)
    expect(sendHourAllowed(7, s)).toBe(false)
    expect(sendHourAllowed(8, s)).toBe(true)
    expect(sendHourAllowed(20, s)).toBe(true)
  })
  it('24 h session window', () => {
    const now = new Date('2026-10-21T12:00:00Z')
    expect(inSession('2026-10-21T00:00:00Z', now)).toBe(true)
    expect(inSession('2026-10-20T11:00:00Z', now)).toBe(false)
    expect(inSession(null, now)).toBe(false)
  })
  it('opt-in resends are capped per day', () => {
    expect(canResendOptin({ optin_sent: { day: '2026-10-21', count: 3, at: '' } }, '2026-10-21')).toBe(false)
    expect(canResendOptin({ optin_sent: { day: '2026-10-20', count: 3, at: '' } }, '2026-10-21')).toBe(true)
  })
  it('ISO week keys', () => {
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01')
    expect(isoWeekKey('2026-10-25')).toBe('2026-W43')
  })
})

describe('settings', () => {
  it('falls back to safe defaults and rejects bad template names', () => {
    const s = normalizePracticeSettings({ max_daily_cap: 999, default_daily_cap: 50, templates: { optin: 'Bad Name!', daily: 'my_daily' }, quiet_start_hour: 22 })
    expect(s.max_daily_cap).toBe(DEFAULT_PRACTICE_SETTINGS.max_daily_cap)
    expect(s.default_daily_cap).toBe(DEFAULT_PRACTICE_SETTINGS.default_daily_cap)
    expect(s.templates).toEqual({ optin: 'cs_practice_optin', daily: 'my_daily', mock: 'cs_practice_mock' })
    expect(s.quiet_start_hour).toBe(22)
  })
})

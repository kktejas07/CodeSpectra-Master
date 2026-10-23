import { describe, expect, it } from 'vitest'
import { accommodatedSections, accommodationExtraMs, attemptDeadlineMs, attemptTimeState } from '@/lib/exam-access'
import { parseGrant } from '@/lib/exam-accommodations'
import { a11yAttributes, normalizeA11y, DEFAULT_A11Y } from '@/lib/accessibility'

const start = '2026-10-23T10:00:00.000Z'
const startMs = Date.parse(start)

describe('extended time accommodations', () => {
  it('adds a percentage or minutes to the test time', () => {
    expect(accommodationExtraMs(60, { percent: 25 })).toBe(15 * 60_000)
    expect(accommodationExtraMs(60, { percent: 50 })).toBe(30 * 60_000)
    expect(accommodationExtraMs(60, { extra_minutes: 10 })).toBe(10 * 60_000)
    expect(accommodationExtraMs(60, null)).toBe(0)
    expect(accommodationExtraMs(0, { percent: 50 })).toBe(0)
    expect(accommodationExtraMs(60, { percent: 9999 })).toBe(180 * 60_000)
  })
  it('extends the server deadline, also past the shared window end', () => {
    const exam = { duration: 60 }
    expect(attemptDeadlineMs(exam, start)).toBe(startMs + 60 * 60_000)
    expect(attemptDeadlineMs(exam, start, { percent: 50 })).toBe(startMs + 90 * 60_000)
    const windowed = { duration: 60, ends_at: '2026-10-23T10:30:00.000Z' }
    expect(attemptDeadlineMs(windowed, start)).toBe(Date.parse('2026-10-23T10:30:00.000Z'))
    expect(attemptDeadlineMs(windowed, start, { percent: 50 })).toBe(Date.parse('2026-10-23T11:00:00.000Z'))
  })
  it('attemptTimeState reads the accommodation from the draft', () => {
    const exam = { duration: 60 }
    const now = startMs + 70 * 60_000 + 3 * 60_000 // past 60 min + grace, inside 75 min
    expect(attemptTimeState(exam, { attempt_no: 1, attempt_started_at: start }, 1, now).status).toBe('expired')
    const s = attemptTimeState(exam, { attempt_no: 1, attempt_started_at: start, time_accommodation: { percent: 25 } }, 1, now)
    expect(s.status).toBe('running')
  })
  it('stretches timed sections only', () => {
    const out = accommodatedSections([{ id: 'a', time_limit_minutes: 20 }, { id: 'b', time_limit_minutes: null }], { percent: 50 })
    expect(out).toEqual([{ id: 'a', time_limit_minutes: 30 }, { id: 'b', time_limit_minutes: null }])
  })
  it('validates grants', () => {
    expect(parseGrant({ kind: 'percent', percent: 25, reason: 'Dyslexia report' })).toEqual({ ok: true, grant: { kind: 'percent', percent: 25, reason: 'Dyslexia report' } })
    expect(parseGrant({ kind: 'minutes', extra_minutes: 15, reason: 'Medical' })).toMatchObject({ ok: true })
    expect(parseGrant({ kind: 'percent', percent: 0, reason: 'xyz' })).toEqual({ ok: false, code: 'accommodation_invalid' })
    expect(parseGrant({ kind: 'minutes', extra_minutes: 601, reason: 'xyz' })).toEqual({ ok: false, code: 'accommodation_invalid' })
    expect(parseGrant({ kind: 'percent', percent: 25 })).toEqual({ ok: false, code: 'accommodation_reason_required' })
  })
})

describe('accessibility settings', () => {
  it('normalises unknown values to defaults', () => {
    expect(normalizeA11y({ text_size: 'huge', contrast: 'high', motion: 'reduce', font: 'comic' })).toEqual({ ...DEFAULT_A11Y, contrast: 'high', motion: 'reduce' })
    expect(normalizeA11y(null)).toEqual(DEFAULT_A11Y)
  })
  it('maps to html data attributes (absent when default)', () => {
    expect(a11yAttributes(DEFAULT_A11Y)).toEqual({ 'data-a11y-text': null, 'data-a11y-contrast': null, 'data-a11y-motion': null, 'data-a11y-font': null })
    expect(a11yAttributes({ text_size: 'xlarge', contrast: 'high', motion: 'reduce', font: 'dyslexic' })).toEqual({ 'data-a11y-text': 'xlarge', 'data-a11y-contrast': 'high', 'data-a11y-motion': 'reduce', 'data-a11y-font': 'dyslexic' })
  })
})

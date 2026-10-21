import { describe, expect, it } from 'vitest'
import {
  adaptiveScore, fallbackLevels, isAdaptiveExam, nextDifficulty, normalizeAdaptiveSettings, thinLevels, type AdaptiveAnswer,
} from '@/lib/adaptive-test'

const a = (difficulty: AdaptiveAnswer['difficulty'], correct: boolean): AdaptiveAnswer => ({ difficulty, correct })

describe('adaptive staircase', () => {
  it('starts at Medium', () => {
    expect(nextDifficulty([])).toBe('Medium')
  })

  it('goes up after two correct in a row, not after one', () => {
    expect(nextDifficulty([a('Medium', true)])).toBe('Medium')
    expect(nextDifficulty([a('Medium', true), a('Medium', true)])).toBe('Hard')
  })

  it('goes down after a wrong answer and resets the streak', () => {
    expect(nextDifficulty([a('Medium', false)])).toBe('Easy')
    expect(nextDifficulty([a('Medium', true), a('Medium', false)])).toBe('Easy')
    // after dropping, two more correct are needed to climb
    expect(nextDifficulty([a('Medium', false), a('Easy', true)])).toBe('Easy')
    expect(nextDifficulty([a('Medium', false), a('Easy', true), a('Easy', true)])).toBe('Medium')
  })

  it('stays inside Easy..Hard', () => {
    expect(nextDifficulty([a('Medium', false), a('Easy', false), a('Easy', false)])).toBe('Easy')
    expect(nextDifficulty([a('Medium', true), a('Medium', true), a('Hard', true), a('Hard', true)])).toBe('Hard')
  })

  it('steers from the level actually served when the bank fell back', () => {
    // wanted Hard after two correct, but the bank only had Medium: one correct Medium is a fresh streak there
    expect(nextDifficulty([a('Medium', true), a('Medium', true), a('Medium', true)])).toBe('Medium')
    expect(nextDifficulty([a('Medium', true), a('Medium', true), a('Medium', true), a('Medium', true)])).toBe('Hard')
    // a wrong answer at a fallback level steps down from that level
    expect(nextDifficulty([a('Medium', true), a('Medium', true), a('Medium', false)])).toBe('Easy')
  })

  it('tries the nearest level first when one runs dry', () => {
    expect(fallbackLevels('Medium')).toEqual(['Medium', 'Easy', 'Hard'])
    expect(fallbackLevels('Hard')).toEqual(['Hard', 'Medium', 'Easy'])
    expect(fallbackLevels('Easy')).toEqual(['Easy', 'Medium', 'Hard'])
  })
})

describe('adaptive score', () => {
  it('weights difficulty against an all-Hard run', () => {
    const s = adaptiveScore([a('Medium', true), a('Medium', true), a('Hard', true), a('Hard', false)], 4)
    expect(s).toMatchObject({ score: 2 + 2 + 3, max: 12, percent: 58, correct: 3, answered: 4, peak: 'Hard' })
  })

  it('counts unanswered questions as zero', () => {
    expect(adaptiveScore([a('Medium', true)], 10)).toMatchObject({ score: 2, max: 30, percent: 7, answered: 1 })
    expect(adaptiveScore([], 0)).toMatchObject({ score: 0, max: 0, percent: 0 })
  })

  it('scores the same number of correct answers higher at harder levels', () => {
    const easy = adaptiveScore([a('Easy', true), a('Easy', true)], 2)
    const hard = adaptiveScore([a('Hard', true), a('Hard', true)], 2)
    expect(hard.percent).toBeGreaterThan(easy.percent)
    expect(hard.percent).toBe(100)
  })
})

describe('adaptive settings', () => {
  it('flags thin levels under 50 approved questions', () => {
    expect(thinLevels({ Easy: 80, Medium: 49 })).toEqual([{ difficulty: 'Medium', count: 49 }, { difficulty: 'Hard', count: 0 }])
  })

  it('needs a domain when on and bounds the length', () => {
    expect(normalizeAdaptiveSettings({ adaptive: true })).toMatchObject({ ok: false })
    expect(normalizeAdaptiveSettings({ adaptive: true, adaptive_domain: 'Java', adaptive_length: '12' })).toEqual({ ok: true, value: { adaptive: true, adaptive_domain: 'java', adaptive_length: 12 } })
    expect(normalizeAdaptiveSettings({ adaptive: true, adaptive_domain: 'java', adaptive_length: 500 }).ok).toBe(false)
    expect(normalizeAdaptiveSettings({ adaptive: false })).toMatchObject({ ok: true, value: { adaptive: false, adaptive_domain: null } })
    expect(normalizeAdaptiveSettings({ adaptive: true, adaptive_domain: '$where' }).ok).toBe(false)
  })

  it('treats only adaptive tests with a domain as adaptive', () => {
    expect(isAdaptiveExam({ adaptive: true, adaptive_domain: 'java' })).toBe(true)
    expect(isAdaptiveExam({ adaptive: true })).toBe(false)
    expect(isAdaptiveExam({ adaptive: 'true', adaptive_domain: 'java' })).toBe(false)
    expect(isAdaptiveExam(null)).toBe(false)
  })
})

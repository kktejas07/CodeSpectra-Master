/**
 * The seeded challenge rows use `duration_minutes` / `success_rate` while the
 * dashboard card reads `duration` / `successRate` — every seeded challenge
 * rendered "undefined min" on /dashboard/challenges. This pins the mapping.
 */
import { describe, expect, it } from 'vitest'
import { normalizeChallengeRow } from '@/lib/challenges/normalize'

describe('normalizeChallengeRow', () => {
  it('maps the API seed shape onto the UI contract', () => {
    const row = normalizeChallengeRow({
      id: 'ch_tech_1',
      title: 'Explain HashMap Internals',
      type: 'technical',
      difficulty: 'easy',
      duration_minutes: 10,
      success_rate: 85,
      description: 'x',
    })
    expect(row.duration).toBe(10)
    expect(row.successRate).toBe(85)
    expect(row.id).toBe('ch_tech_1')
  })

  it('maps the legacy seed-all shape too', () => {
    const row = normalizeChallengeRow({ id: '1', title: 'System Design', duration: 60, successRate: 92.15 })
    expect(row.duration).toBe(60)
    expect(row.successRate).toBe(92.15)
  })

  it('never emits undefined numbers when both spellings are missing', () => {
    const row = normalizeChallengeRow({ _id: 'abc123', title: 'No duration' })
    expect(row.duration).toBe(15)
    expect(row.successRate).toBe(50)
    expect(row.id).toBe('abc123')
  })

  it('defaults prerequisites to an array so the card can render', () => {
    expect(normalizeChallengeRow({ id: 'x' }).prerequisites).toEqual([])
  })
})

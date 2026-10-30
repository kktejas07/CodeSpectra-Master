/**
 * Cross-page uniqueness: the same question must not sit on two practice pages.
 * Measured 2026-10-30: "Two Sum" was in both arena and problems because each
 * seeder only looked at its own collection.
 */
import { describe, expect, it } from 'vitest'
import type { Db } from 'mongodb'
import { normalizeTitle, findTitleOwner, existingPracticeTitles } from '@/lib/practice-content/uniqueness'

function fakeDb(rows: Record<string, Record<string, unknown>[]>): Db {
  return {
    collection: (name: string) => ({
      find: () => ({ toArray: async () => rows[name] ?? [] }),
    }),
  } as unknown as Db
}

describe('normalizeTitle', () => {
  it('collapses case, punctuation and spacing', () => {
    expect(normalizeTitle('Two Sum')).toBe('two sum')
    expect(normalizeTitle('  two-sum! ')).toBe('two sum')
    expect(normalizeTitle(undefined)).toBe('')
  })
})

describe('findTitleOwner', () => {
  const db = fakeDb({
    arena_challenges: [{ id: '1', title: 'Count Pairs With Difference K' }],
    problems: [{ id: 'p1', slug: 'two-sum', title: 'Two Sum' }],
    challenges: [{ id: 'ch_1', title: 'Explain HashMap Internals' }],
  })

  it('finds a title owned by another collection', async () => {
    expect(await findTitleOwner(db, 'two sum')).toMatchObject({ collection: 'problems', id: 'p1' })
  })

  it('returns nothing for a fresh title', async () => {
    expect(await findTitleOwner(db, 'Rotate A Matrix In Place')).toBeUndefined()
  })

  it('indexes every practice collection once', async () => {
    const map = await existingPracticeTitles(db)
    expect(map.size).toBe(3)
    expect([...map.values()].map(v => v.collection).sort()).toEqual(['arena_challenges', 'challenges', 'problems'])
  })
})

/**
 * Cross-page uniqueness.
 *
 * Practice content lives in three collections and one curriculum file. Each
 * seeder and generator only checked its OWN collection, so the same question
 * could appear on two pages — measured 2026-10-30: "Two Sum" was in both
 * `arena_challenges` and `problems`.
 *
 * Titles are compared normalised (case/punctuation collapsed). No `server-only`
 * here: backfill scripts load it under tsx.
 */
import type { Db } from 'mongodb'

export const PRACTICE_COLLECTIONS = ['arena_challenges', 'problems', 'challenges'] as const

export function normalizeTitle(title: unknown): string {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export interface ExistingTitle {
  collection: string
  id: string
  title: string
}

/** Every title currently served by a practice page (drafts included — they publish later). */
export async function existingPracticeTitles(db: Db): Promise<Map<string, ExistingTitle>> {
  const out = new Map<string, ExistingTitle>()
  for (const collection of PRACTICE_COLLECTIONS) {
    const rows = await db.collection(collection).find({}, { projection: { id: 1, slug: 1, title: 1 } }).toArray()
    for (const row of rows) {
      const key = normalizeTitle(row.title)
      if (!key || out.has(key)) continue
      out.set(key, { collection, id: String(row.id ?? row.slug ?? ''), title: String(row.title ?? '') })
    }
  }
  return out
}

/** The collection + id already using this title, if any. */
export async function findTitleOwner(db: Db, title: unknown): Promise<ExistingTitle | undefined> {
  const key = normalizeTitle(title)
  if (!key) return undefined
  return (await existingPracticeTitles(db)).get(key)
}

export function titleKey(title: unknown): string {
  return normalizeTitle(title)
}

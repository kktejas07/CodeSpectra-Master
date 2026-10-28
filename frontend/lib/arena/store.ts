/**
 * Arena challenges: the database is the source of truth.
 *
 * Before this, the list page read Mongo but the detail page, the AI adapt
 * route and the submit grader all read the 6-item hardcoded array in
 * `lib/arena-challenges.ts` — so any generated challenge appeared in the list
 * and then 404'd when clicked. Everything now goes through here.
 *
 * Reads fall back to the seed array only when Mongo is unreachable, so the UI
 * degrades instead of breaking.
 */
import 'server-only'
import { ObjectId } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { ARENA_CHALLENGES, getArenaChallenge as getSeedChallenge, type ArenaChallenge } from '@/lib/arena-challenges'

export const ARENA_COLLECTION = 'arena_challenges'
export const ARENA_SUBMISSIONS = 'arena_submissions'

export type ArenaStats = { solved: number; attempts: number }

function normalize(doc: Record<string, unknown>): ArenaChallenge | null {
  const id = String(doc.id ?? doc.slug ?? doc._id ?? '').trim()
  if (!id) return null
  return {
    ...(doc as unknown as ArenaChallenge),
    id,
    // Both fields are real numbers or 0 — never invent engagement.
    solved: 0,
    attempts: 0,
  }
}

export async function ensureArenaSeeded(): Promise<void> {
  try {
    const db = await getMongoDb()
    const col = db.collection(ARENA_COLLECTION)
    if ((await col.estimatedDocumentCount()) > 0) return
    await col.insertMany(ARENA_CHALLENGES.map(c => ({ ...c })))
  } catch {
    console.warn('[arena] auto-seed skipped')
  }
}

/** Every challenge, newest-first is not meaningful here — keep insertion order. */
export async function listArenaChallenges(): Promise<ArenaChallenge[]> {
  try {
    await ensureArenaSeeded()
    const db = await getMongoDb()
    const docs = await db.collection(ARENA_COLLECTION).find({}).sort({ _id: 1 }).toArray()
    const rows = docs.map(d => normalize(d as Record<string, unknown>)).filter((c): c is ArenaChallenge => Boolean(c))
    return rows.length ? rows : ARENA_CHALLENGES
  } catch {
    return ARENA_CHALLENGES
  }
}

/** Accepts the stored `id`, a `slug`, or a raw ObjectId string. */
export async function loadArenaChallenge(idOrSlug: string): Promise<ArenaChallenge | undefined> {
  const key = String(idOrSlug || '').trim()
  if (!key) return undefined
  try {
    const db = await getMongoDb()
    const or: Record<string, unknown>[] = [{ id: key }, { slug: key }]
    if (/^[a-f0-9]{24}$/i.test(key)) or.push({ _id: new ObjectId(key) })
    const doc = await db.collection(ARENA_COLLECTION).findOne({ $or: or })
    if (doc) return normalize(doc as Record<string, unknown>) ?? undefined
  } catch {
    // fall through to the seed
  }
  return getSeedChallenge(key)
}

/**
 * Real engagement from `arena_submissions` (the values in the seeds — 1245
 * solved, 3 attempts — were invented).
 */
export async function arenaStats(): Promise<Record<string, ArenaStats>> {
  const out: Record<string, ArenaStats> = {}
  try {
    const db = await getMongoDb()
    const rows = await db.collection(ARENA_SUBMISSIONS).aggregate<{
      _id: string
      attempts: number
      solvedBy: unknown[]
    }>([
      { $match: { challengeId: { $type: 'string' } } },
      {
        $group: {
          _id: '$challengeId',
          attempts: { $sum: 1 },
          solvedBy: { $addToSet: { $cond: [{ $eq: ['$status', 'accepted'] }, '$userId', '$$REMOVE'] } },
        },
      },
    ]).toArray()
    for (const r of rows) {
      if (!r?._id) continue
      out[r._id] = { solved: Array.isArray(r.solvedBy) ? r.solvedBy.length : 0, attempts: r.attempts || 0 }
    }
  } catch {
    // stats are cosmetic; an empty map just renders zeros
  }
  return out
}

/**
 * Materialised leaderboard totals (audit A-047).
 *
 * The leaderboard used to aggregate every xp_events row on each view (twice:
 * top list + "users above me"). Now one aggregation per (category, period)
 * builds the totals, cached in-process for 60 s with a single in-flight
 * refresh; the top list and every viewer's rank come from that snapshot.
 * Writes are never blocked; new XP shows up within a minute.
 */
import { buildXpMatch, type LeaderboardCategory, type LeaderboardPeriod } from '@/lib/leaderboard-calc'

export const LEADERBOARD_TTL_MS = 60_000
const TOP_KEEP = 150

export interface LeaderboardTotal { userId: string; xp: number; solved: number; last: string | null }

export interface LeaderboardSnapshot {
  at: number
  /** Top users by XP (desc, ties by userId). */
  top: LeaderboardTotal[]
  /** Every user's XP, descending — for rank lookups. */
  xpDesc: number[]
  byUser: Map<string, number>
}

/** Pure: number of users with strictly more XP than `xp` (xpDesc sorted descending). */
export function countAbove(xpDesc: number[], xp: number): number {
  let lo = 0
  let hi = xpDesc.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (xpDesc[mid] > xp) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Pure: build a snapshot from aggregated totals. */
export function buildSnapshot(totals: LeaderboardTotal[], at = Date.now()): LeaderboardSnapshot {
  const positive = totals.filter((t) => Number.isFinite(t.xp) && t.xp > 0)
  positive.sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId))
  return {
    at,
    top: positive.slice(0, TOP_KEEP),
    xpDesc: positive.map((t) => t.xp),
    byUser: new Map(positive.map((t) => [t.userId, t.xp])),
  }
}

const cache = new Map<string, LeaderboardSnapshot>()
const inflight = new Map<string, Promise<LeaderboardSnapshot>>()

async function compute(category: LeaderboardCategory, period: LeaderboardPeriod): Promise<LeaderboardSnapshot> {
  const { getMongoDb } = await import('@/lib/mongodb')
  const db = await getMongoDb()
  const rows = await db.collection('xp_events')
    .aggregate<{ _id: string; xp: number; solved: number; last: string | null }>([
      { $match: buildXpMatch(category, period, new Date()) },
      {
        $group: {
          _id: '$user_id',
          xp: { $sum: '$amount' },
          solved: { $sum: { $cond: [{ $eq: ['$reason', 'submission_accepted'] }, 1, 0] } },
          last: { $max: '$created_at' },
        },
      },
      { $match: { xp: { $gt: 0 } } },
    ], { allowDiskUse: true })
    .toArray()
  return buildSnapshot(rows.map((r) => ({ userId: String(r._id), xp: Number(r.xp) || 0, solved: Number(r.solved) || 0, last: r.last ?? null })))
}

export async function getLeaderboardSnapshot(category: LeaderboardCategory, period: LeaderboardPeriod): Promise<LeaderboardSnapshot> {
  const key = `${category}:${period}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < LEADERBOARD_TTL_MS) return hit
  let p = inflight.get(key)
  if (!p) {
    p = compute(category, period)
      .then((snap) => { cache.set(key, snap); return snap })
      .finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  try {
    return await p
  } catch (e) {
    if (hit) return hit // serve stale on a failed refresh
    throw e
  }
}

export function invalidateLeaderboardCache(): void {
  cache.clear()
}

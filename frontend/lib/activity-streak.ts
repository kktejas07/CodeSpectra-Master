/**
 * Server helper: a user's coding streak from accepted practice submissions.
 * Shared by /api/user/stats, /api/daily-challenge and /api/user/100-days so
 * every widget shows the same number.
 */
import { getMongoDb } from '@/lib/mongodb'
import { computeStreak, dayKey, type StreakResult } from '@/lib/streak'

// ponytail: looks back 400 days; a streak longer than that is capped at 400.
const LOOKBACK_DAYS = 400

export async function getAcceptedDays(userId: string): Promise<string[]> {
  const db = await getMongoDb()
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const rows = await db
    .collection('submissions')
    .aggregate<{ _id: string }>([
      { $match: { user_id: userId, status: 'accepted' } },
      { $project: { day: { $substrBytes: [{ $toString: '$created_at' }, 0, 10] } } },
      { $match: { day: { $gte: since.slice(0, 10) } } },
      { $group: { _id: '$day' } },
    ])
    .toArray()
  return rows.map((r) => r._id).filter(Boolean)
}

export async function getUserStreak(userId: string): Promise<StreakResult & { days: string[] }> {
  const days = await getAcceptedDays(userId)
  return { ...computeStreak(days, dayKey(new Date())), days }
}

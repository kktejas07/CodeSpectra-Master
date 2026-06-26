/**
 * GET /api/leaderboard?scope=global|team|monthly&limit=80
 *
 * Computes rankings from the MongoDB `xp_events` collection.
 *   - global  : all-time XP sum per user.
 *   - monthly : XP earned since the start of the current UTC month.
 *   - team    : filtered to members of the caller's organization (`tenantId`).
 *
 * Returns an array of `LeaderboardEntryDTO`.
 */
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getAPIUser } from '@/lib/api-auth'
import { xpEvents } from '@/lib/db/leaderboard'
import { getMongoDb } from '@/lib/mongodb'
import {
  languageBadgeClass,
  languageLabel,
  rankTitle,
  xpToLevel,
} from '@/lib/leaderboard-utils'
import type { LeaderboardEntryDTO } from '@/lib/leaderboard-types'

export const runtime = 'nodejs'

function avatarUrl(seed: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`
}

interface UserProfile {
  _id: ObjectId | string
  email?: string
  name?: string
  fullName?: string
  preferredLanguage?: string
  tenantId?: string
  organizationId?: string
}

/** Better Auth stores `_id` as a real `ObjectId` even though `user.id` is a hex string. */
function toObjectIdArray(ids: string[]): ObjectId[] {
  const out: ObjectId[] = []
  for (const id of ids) {
    if (ObjectId.isValid(id)) out.push(new ObjectId(id))
  }
  return out
}
function idToString(u: UserProfile): string {
  return typeof u._id === 'string' ? u._id : u._id.toHexString()
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const scope = (searchParams.get('scope') || 'global').toLowerCase()
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)))

  const me = await getAPIUser()

  try {
    const events = await xpEvents()

    const match: Record<string, unknown> = {}
    if (scope === 'monthly') {
      const monthStart = new Date()
      monthStart.setUTCDate(1)
      monthStart.setUTCHours(0, 0, 0, 0)
      match.created_at = { $gte: monthStart.toISOString() }
    }

    const xpAgg = await events
      .aggregate<{ _id: string; total: number; lastAward: string }>([
        { $match: match },
        {
          $group: {
            _id: '$user_id',
            total: { $sum: '$amount' },
            lastAward: { $max: '$created_at' },
          },
        },
        { $sort: { total: -1 } },
        { $limit: limit * 2 }, // overshoot to allow team filter
      ])
      .toArray()

    if (xpAgg.length === 0) {
      return NextResponse.json({ scope, entries: [], total: 0, organizationId: null })
    }

    const userIds = xpAgg.map((r) => r._id)
    const db = await getMongoDb()
    const objectIds = toObjectIdArray(userIds)
    const userDocs = (await db
      .collection('user')
      .find({ _id: { $in: objectIds } })
      .toArray()) as unknown as UserProfile[]
    const userById = new Map(userDocs.map((u) => [idToString(u), u]))

    let orgFilter: string | null = null
    if (scope === 'team') {
      if (!me) {
        return NextResponse.json({ error: 'Sign in to view team leaderboard' }, { status: 401 })
      }
      const myDoc =
        userById.get(me.id) ||
        (ObjectId.isValid(me.id)
          ? ((await db
              .collection('user')
              .findOne({ _id: new ObjectId(me.id) })) as unknown as UserProfile | null)
          : null)
      orgFilter = myDoc?.tenantId || myDoc?.organizationId || null
      if (!orgFilter) {
        return NextResponse.json({
          scope: 'team',
          entries: [],
          total: 0,
          organizationId: null,
          message: 'Your profile has no organization assigned yet.',
        })
      }
    }

    // Build solved-counts (from accepted submissions, optional but cheap).
    const solved = await db
      .collection<{ user_id: string }>('submissions')
      .aggregate<{ _id: string; count: number }>([
        { $match: { user_id: { $in: userIds }, status: 'accepted' } },
        { $group: { _id: '$user_id', count: { $addToSet: '$problem_id' } } },
        { $project: { count: { $size: '$count' } } },
      ])
      .toArray()
    const solvedById = new Map(solved.map((s) => [s._id, s.count]))

    const rows = xpAgg
      .map((row) => {
        const u = userById.get(row._id)
        return { row, u }
      })
      .filter(({ u }) => {
        if (scope !== 'team') return true
        return (u?.tenantId || u?.organizationId) === orgFilter
      })
      .slice(0, limit)

    const entries: LeaderboardEntryDTO[] = rows.map(({ row, u }, i) => {
      const email = u?.email || ''
      const baseName =
        (u?.fullName || u?.name || '').trim() ||
        (email ? email.split('@')[0] : 'Developer')
      const name = me?.id === row._id ? `${baseName} (You)` : baseName
      const xp = row.total
      const lang = languageLabel(u?.preferredLanguage || 'javascript')
      return {
        rank: i + 1,
        userId: row._id,
        name,
        title: rankTitle(i + 1),
        level: xpToLevel(xp),
        xp,
        language: lang,
        languageClass: languageBadgeClass(lang),
        avatar: avatarUrl(email || row._id),
        lastSubmission: row.lastAward || null,
        streak: 0,
        challengesSolved: solvedById.get(row._id) ?? 0,
      }
    })

    return NextResponse.json({
      scope,
      entries,
      total: entries.length,
      organizationId: orgFilter,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Leaderboard error'
    console.error('[CodeSpectra] /api/leaderboard:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

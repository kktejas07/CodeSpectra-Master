import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/admin'
import { awardXp } from '@/lib/db/leaderboard'
import { getGamificationConfig, loginXp, nextLoginStreak } from '@/lib/gamification-config'

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * POST /api/daily-login — once per UTC day: award the daily-login XP (as an
 * `xp_events` row, so it counts on the leaderboard) and advance the login
 * streak stored in `user_streaks`. The day is claimed atomically, so parallel
 * calls (several tabs) award once.
 */
export async function POST() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const userId = gate.user.id
    const config = await getGamificationConfig()
    const now = new Date()
    const today = utcDay(now)

    const streakCol = db.collection('user_streaks')
    const existing = await streakCol.findOne({ user_id: userId })
    const lastDay: string | null =
      existing?.last_login_day ?? (existing?.last_login_at ? String(existing.last_login_at).slice(0, 10) : null)

    if (lastDay === today) {
      return NextResponse.json({
        awarded: false,
        xp: 0,
        streak: existing?.streak ?? 1,
        message: 'Daily login XP already awarded today',
      })
    }

    // Streak freezes (one token per missed day) + multiplier — lib/gamification-config.ts (A-027).
    const step = nextLoginStreak({
      lastDay,
      today,
      streak: Number(existing?.streak) || 0,
      freezeTokens: Number(existing?.freeze_tokens) || 0,
      config: config.streak,
    })
    const streak = step.streak
    const longestStreak = Math.max(streak, Number(existing?.longest_streak) || 0)

    // Claim today: only succeeds if no other request already moved last_login_day to today.
    const fields = {
      streak,
      freeze_tokens: step.freezeTokens,
      ...(step.freezesUsed ? { last_freeze_used_at: nowIso() } : {}),
      longest_streak: longestStreak,
      last_login_day: today,
      last_login_at: nowIso(),
      updated_at: nowIso(),
    }
    let claimed: boolean
    if (existing) {
      const r = await streakCol.updateOne(
        { user_id: userId, last_login_day: { $ne: today } },
        { $set: fields, $unset: { today_xp_awarded: '' } },
      )
      claimed = r.modifiedCount > 0
    } else {
      // ponytail: no unique index on user_id; two first-ever calls racing can both insert.
      // awardXp still dedupes the XP by day key.
      const r = await streakCol.updateOne({ user_id: userId }, { $setOnInsert: { user_id: userId, ...fields } }, { upsert: true })
      claimed = r.upsertedCount > 0
    }
    if (!claimed) {
      return NextResponse.json({ awarded: false, xp: 0, streak, message: 'Daily login XP already awarded today' })
    }

    const { dailyXp, streakBonus: streakXp } = loginXp(config, streak)

    // awardXp dedupes on (user, submission_id, reason), so the day key makes this idempotent.
    const dailyId = await awardXp({
      userId,
      amount: dailyXp,
      reason: 'daily_login',
      submissionId: `daily_login:${today}`,
      metadata: { day: today },
    })
    const streakId = streakXp > 0
      ? await awardXp({
          userId,
          amount: streakXp,
          reason: 'daily_login',
          submissionId: `login_streak_${streak}:${today}`,
          metadata: { day: today, streak },
        })
      : null

    const awardedDaily = dailyId ? dailyXp : 0
    const awardedStreak = streakId ? streakXp : 0
    return NextResponse.json({
      awarded: awardedDaily + awardedStreak > 0,
      xp: awardedDaily + awardedStreak,
      streak,
      streakXp: awardedStreak,
      dailyXp: awardedDaily,
      freezeTokens: step.freezeTokens,
      freezesUsed: step.freezesUsed,
    })
  } catch (error) {
    console.error('[CodeSpectra] Error processing daily login:', error)
    return NextResponse.json({ error: 'Failed to process daily login' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/admin'
import { awardXp } from '@/lib/db/leaderboard'

const DEFAULT_GAMIFICATION = {
  xp_rewards: { easy: 10, medium: 25, hard: 50, first_blood: 25, exam_pass: 50, cert_pass: 100, codeathon: 20, hackathon: 100, daily_login: 5, streak_7day: 25, streak_30day: 100 },
  levels: { 2: 100, 5: 500, 10: 2000, 20: 8000, 50: 50000 },
  streak: { multiplier: 1.5, freeze_enabled: true },
  referral: { xp_bonus: 500, commission_percent: 10 },
  badges: { hackathon: true, exam: true, cert: true, streak: true }
}

async function getGamificationConfig() {
  const db = await getMongoDb()
  const doc = await db.collection('platform_settings').findOne({ key: 'gamification' })
  const stored = doc?.value || {}
  return {
    xp_rewards: { ...DEFAULT_GAMIFICATION.xp_rewards, ...(stored.xp_rewards || {}) },
    levels: { ...DEFAULT_GAMIFICATION.levels, ...(stored.levels || {}) },
    streak: { ...DEFAULT_GAMIFICATION.streak, ...(stored.streak || {}) },
    referral: { ...DEFAULT_GAMIFICATION.referral, ...(stored.referral || {}) },
    badges: { ...DEFAULT_GAMIFICATION.badges, ...(stored.badges || {}) }
  }
}

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
    const yesterday = utcDay(new Date(now.getTime() - 86_400_000))

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

    const streak = lastDay === yesterday ? (Number(existing?.streak) || 0) + 1 : 1
    const longestStreak = Math.max(streak, Number(existing?.longest_streak) || 0)

    // Claim today: only succeeds if no other request already moved last_login_day to today.
    const fields = {
      streak,
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

    const dailyXp = Number(config.xp_rewards.daily_login) || 0
    let streakXp = 0
    if (streak === 7) streakXp = Number(config.xp_rewards.streak_7day) || 0
    else if (streak === 30) streakXp = Number(config.xp_rewards.streak_30day) || 0

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
    })
  } catch (error) {
    console.error('[CodeSpectra] Error processing daily login:', error)
    return NextResponse.json({ error: 'Failed to process daily login' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/admin'

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

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function POST() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const userId = gate.user.id
    const config = await getGamificationConfig()
    const today = startOfDay(new Date())
    const todayStart = today.toISOString()

    const streakCol = db.collection('user_streaks')
    const streakDoc = await streakCol.findOne({ user_id: userId })

    if (streakDoc?.today_xp_awarded) {
      return NextResponse.json({
        awarded: false,
        xp: 0,
        streak: streakDoc.streak,
        message: 'Daily login XP already awarded today'
      })
    }

    const dailyXp = config.xp_rewards.daily_login
    const usersCol = db.collection('user')
    const userDoc = await usersCol.findOne({ id: userId })
    const currentXp = (userDoc as any)?.xp || 0
    const newXp = currentXp + dailyXp

    await usersCol.updateOne(
      { id: userId },
      { $set: { xp: newXp, updatedAt: new Date() } }
    )

    let streak = 1
    let streakXp = 0

    if (streakDoc) {
      const lastLogin = new Date(streakDoc.last_login_at)
      const diffMs = today.getTime() - startOfDay(lastLogin).getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)

      if (diffDays >= 1 && diffDays <= 1.083) {
        streak = streakDoc.streak + 1
      } else if (diffDays > 1.083) {
        streak = 1
      } else {
        streak = streakDoc.streak
      }

      if (streak === 7) {
        streakXp = config.xp_rewards.streak_7day
      } else if (streak === 30) {
        streakXp = config.xp_rewards.streak_30day
      }

      if (streakXp > 0) {
        await usersCol.updateOne(
          { id: userId },
          { $set: { xp: newXp + streakXp, updatedAt: new Date() } }
        )
      }

      const longestStreak = Math.max(streak, streakDoc.longest_streak || 0)
      await streakCol.updateOne(
        { user_id: userId },
        {
          $set: {
            streak,
            longest_streak: longestStreak,
            last_login_at: nowIso(),
            today_xp_awarded: true,
            updated_at: nowIso()
          }
        }
      )
    } else {
      const doc = {
        user_id: userId,
        streak: 1,
        longest_streak: 1,
        last_login_at: nowIso(),
        today_xp_awarded: true,
        updated_at: nowIso()
      }
      await streakCol.insertOne(doc)
    }

    const totalXp = dailyXp + streakXp

    return NextResponse.json({
      awarded: true,
      xp: totalXp,
      streak,
      streakXp,
      dailyXp
    })
  } catch (error) {
    console.error('[CodeSpectra] Error processing daily login:', error)
    return NextResponse.json({ error: 'Failed to process daily login' }, { status: 500 })
  }
}

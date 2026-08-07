import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const userId = gate.user.id

    const streakDoc = await db.collection('user_streaks').findOne({ user_id: userId })

    if (!streakDoc) {
      return NextResponse.json({
        streak: 0,
        lastLoginAt: null,
        longestStreak: 0,
        todayXpAwarded: false
      })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.toISOString()
    const lastLogin = streakDoc.last_login_at ? new Date(streakDoc.last_login_at) : null
    const lastLoginDay = lastLogin ? startOfDay(lastLogin).toISOString() : null
    const todayXpAwarded = streakDoc.today_xp_awarded && lastLoginDay === todayStart

    return NextResponse.json({
      streak: streakDoc.streak || 0,
      lastLoginAt: streakDoc.last_login_at || null,
      longestStreak: streakDoc.longest_streak || 0,
      todayXpAwarded
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching streak:', error)
    return NextResponse.json({ error: 'Failed to fetch streak' }, { status: 500 })
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

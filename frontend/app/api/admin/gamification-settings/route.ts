import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

const DEFAULT_GAMIFICATION = {
  xp_rewards: { easy: 10, medium: 25, hard: 50, first_blood: 25, exam_pass: 50, cert_pass: 100, codeathon: 20, hackathon: 100, daily_login: 5, streak_7day: 25, streak_30day: 100 },
  levels: { 2: 100, 5: 500, 10: 2000, 20: 8000, 50: 50000 },
  streak: { multiplier: 1.5, freeze_enabled: true },
  referral: { xp_bonus: 500, commission_percent: 10 },
  badges: { hackathon: true, exam: true, cert: true, streak: true }
}

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'gamification' })
    const stored = doc?.value || {}
    const config = {
      xp_rewards: { ...DEFAULT_GAMIFICATION.xp_rewards, ...(stored.xp_rewards || {}) },
      levels: { ...DEFAULT_GAMIFICATION.levels, ...(stored.levels || {}) },
      streak: { ...DEFAULT_GAMIFICATION.streak, ...(stored.streak || {}) },
      referral: { ...DEFAULT_GAMIFICATION.referral, ...(stored.referral || {}) },
      badges: { ...DEFAULT_GAMIFICATION.badges, ...(stored.badges || {}) }
    }
    return NextResponse.json(config)
  } catch (error) {
    console.error('[CodeSpectra] Error fetching gamification settings:', error)
    return NextResponse.json({ error: 'Failed to fetch gamification settings' }, { status: 500 })
  }
}

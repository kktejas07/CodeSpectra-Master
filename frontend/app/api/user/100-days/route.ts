import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

interface DayProgress {
  day: number
  completed: boolean
  problemsCompleted: string[]
  completedAt?: string
}

interface User100DaysProgress {
  userId: string
  completedDays: number[]
  dayProgress: Record<number, DayProgress>
  currentDay: number
  streak: number
  totalProblemsSolved: number
  language: string
  updatedAt: string
}

/** GET — Load user's 100-days progress */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = await getMongoDb()
    const doc = await db.collection('user_100days_progress').findOne({ userId: user.id })
    
    if (!doc) {
      return NextResponse.json({
        completedDays: [],
        dayProgress: {},
        currentDay: 1,
        streak: 0,
        totalProblemsSolved: 0,
        language: 'python',
      })
    }

    return NextResponse.json({
      completedDays: doc.completedDays || [],
      dayProgress: doc.dayProgress || {},
      currentDay: doc.currentDay || 1,
      streak: doc.streak || 0,
      totalProblemsSolved: doc.totalProblemsSolved || 0,
      language: doc.language || 'python',
    })
  } catch (e) {
    console.error('[100-days] Load error:', e)
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 })
  }
}

/** POST — Save user's 100-days progress */
export async function POST(request: Request) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Partial<User100DaysProgress>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    
    if (body.completedDays) update.completedDays = body.completedDays
    if (body.dayProgress) update.dayProgress = body.dayProgress
    if (body.currentDay) update.currentDay = body.currentDay
    if (body.streak !== undefined) update.streak = body.streak
    if (body.totalProblemsSolved !== undefined) update.totalProblemsSolved = body.totalProblemsSolved
    if (body.language) update.language = body.language

    await db.collection('user_100days_progress').updateOne(
      { userId: user.id },
      { $set: update },
      { upsert: true }
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[100-days] Save error:', e)
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }
}

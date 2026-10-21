import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const userId = gate.user.id

    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 364)
    const startStr = startDate.toISOString().slice(0, 10)
    const endStr = now.toISOString().slice(0, 10)

    const dateKey = (d: Date) => d.toISOString().slice(0, 10)

    const matchStage = {
      user_id: userId,
      created_at: { $gte: `${startStr}T00:00:00.000Z`, $lte: `${endStr}T23:59:59.999Z` }
    }

    const xpPipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$created_at' } } },
          count: { $sum: 1 },
          xp: { $sum: '$amount' }
        }
      }
    ]

    const submissionPipeline = [
      { $match: { ...matchStage, status: 'accepted' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$created_at' } } },
          problems: { $sum: 1 }
        }
      }
    ]

    const examPipeline = [
      { $match: { user_id: userId, reason: 'exam_passed', created_at: { $gte: `${startStr}T00:00:00.000Z`, $lte: `${endStr}T23:59:59.999Z` } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$created_at' } } },
          exams: { $sum: 1 }
        }
      }
    ]

    const hackathonPipeline = [
      { $match: { user_id: userId, reason: { $in: ['codeathon_attended', 'hackathon_score'] }, created_at: { $gte: `${startStr}T00:00:00.000Z`, $lte: `${endStr}T23:59:59.999Z` } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$created_at' } } },
          hackathons: { $sum: 1 }
        }
      }
    ]

    const [xpResults, submissionResults, examResults, hackathonResults] = await Promise.all([
      db.collection('xp_events').aggregate(xpPipeline).toArray(),
      db.collection('submissions').aggregate(submissionPipeline).toArray(),
      db.collection('xp_events').aggregate(examPipeline).toArray(),
      db.collection('xp_events').aggregate(hackathonPipeline).toArray(),
    ])

    const xpMap: Record<string, { count: number; xp: number }> = {}
    for (const r of xpResults) {
      if (r._id) xpMap[r._id] = { count: r.count, xp: r.xp }
    }

    const problemMap: Record<string, number> = {}
    for (const r of submissionResults) {
      if (r._id) problemMap[r._id] = r.problems
    }

    const examMap: Record<string, number> = {}
    for (const r of examResults) {
      if (r._id) examMap[r._id] = r.exams
    }

    const hackathonMap: Record<string, number> = {}
    for (const r of hackathonResults) {
      if (r._id) hackathonMap[r._id] = r.hackathons
    }

    const contributions: Array<{
      date: string
      count: number
      xp: number
      problems: number
      exams: number
      hackathons: number
    }> = []

    const cursor = new Date(startDate)
    while (cursor <= now) {
      const d = dateKey(cursor)
      const xpData = xpMap[d]
      const problems = problemMap[d] || 0
      const exams = examMap[d] || 0
      const hackathons = hackathonMap[d] || 0
      const count = (xpData?.count || 0) + problems + exams + hackathons
      contributions.push({
        date: d,
        count,
        xp: xpData?.xp || 0,
        problems,
        exams,
        hackathons,
      })
      cursor.setDate(cursor.getDate() + 1)
    }

    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0
    for (const c of contributions) {
      if (c.count > 0) {
        tempStreak++
        longestStreak = Math.max(longestStreak, tempStreak)
      } else {
        tempStreak = 0
      }
    }

    const today = dateKey(now)
    for (let i = contributions.length - 1; i >= 0; i--) {
      if (contributions[i].count > 0 && contributions[i].date <= today) {
        currentStreak++
      } else if (contributions[i].date <= today) {
        break
      }
    }

    const totalContributions = contributions.reduce((s, c) => s + c.count, 0)

    return NextResponse.json({
      contributions,
      total_contributions: totalContributions,
      current_streak: currentStreak,
      longest_streak: longestStreak,
    })
  } catch (e) {
    console.error('[contribution-graph] error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

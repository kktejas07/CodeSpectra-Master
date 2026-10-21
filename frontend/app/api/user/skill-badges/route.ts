import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

interface BadgeDef {
  id: string
  name: string
  icon: string
  description: string
  threshold: number
  type: 'problems' | 'language' | 'streak' | 'hackathon'
  language?: string
}

const BADGES: BadgeDef[] = [
  { id: 'problem-solver', name: 'Problem Solver', icon: 'Target', description: 'Solved 5+ problems', threshold: 5, type: 'problems' },
  { id: 'speed-runner', name: 'Speed Runner', icon: 'Zap', description: 'Solved 10+ problems', threshold: 10, type: 'problems' },
  { id: 'code-warrior', name: 'Code Warrior', icon: 'Swords', description: 'Solved 25+ problems', threshold: 25, type: 'problems' },
  { id: 'python-expert', name: 'Python Expert', icon: 'Terminal', description: 'Solved 5+ Python problems', threshold: 5, type: 'language', language: 'python' },
  { id: 'javascript-master', name: 'JavaScript Master', icon: 'Braces', description: 'Solved 5+ JavaScript problems', threshold: 5, type: 'language', language: 'javascript' },
  { id: 'java-guru', name: 'Java Guru', icon: 'Coffee', description: 'Solved 5+ Java problems', threshold: 5, type: 'language', language: 'java' },
  { id: 'sql-specialist', name: 'SQL Specialist', icon: 'Database', description: 'Solved 5+ SQL problems', threshold: 5, type: 'language', language: 'sql' },
  { id: 'react-pro', name: 'React Pro', icon: 'Atom', description: 'Solved 5+ React problems', threshold: 5, type: 'language', language: 'react' },
  { id: 'cpp-champion', name: 'C++ Champion', icon: 'Cpu', description: 'Solved 5+ C++ problems', threshold: 5, type: 'language', language: 'c++' },
  { id: '30-day-streak', name: '30-Day Streak', icon: 'Flame', description: '30+ day coding streak', threshold: 30, type: 'streak' },
  { id: 'hackathon-hero', name: 'Hackathon Hero', icon: 'Trophy', description: 'Participated in 3+ hackathons', threshold: 3, type: 'hackathon' },
]

function normalizeLanguage(lang: string): string {
  const l = (lang || '').toLowerCase().trim()
  if (l.includes('python') || l === 'py') return 'python'
  if (l.includes('javascript') || l === 'js' || l === 'node') return 'javascript'
  if (l.includes('java') && !l.includes('javascript')) return 'java'
  if (l.includes('sql') || l.includes('mysql') || l.includes('postgres')) return 'sql'
  if (l.includes('react') || l.includes('jsx') || l.includes('tsx')) return 'react'
  if (l.includes('c++') || l === 'cpp') return 'c++'
  return l
}

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const userId = gate.user.id

    const solvedByLang = await db.collection('submissions').aggregate([
      { $match: { user_id: userId, status: 'accepted' } },
      { $group: { _id: '$language', count: { $sum: 1 } } }
    ]).toArray()

    const langCounts: Record<string, number> = {}
    for (const r of solvedByLang) {
      const normalized = normalizeLanguage(r._id)
      langCounts[normalized] = (langCounts[normalized] || 0) + r.count
    }

    const totalSolved = Object.values(langCounts).reduce((s, c) => s + c, 0)

    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 364)
    const startStr = startDate.toISOString().slice(0, 10)
    const endStr = now.toISOString().slice(0, 10)

    const streakResults = await db.collection('xp_events').aggregate([
      { $match: { user_id: userId, created_at: { $gte: `${startStr}T00:00:00.000Z`, $lte: `${endStr}T23:59:59.999Z` } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$created_at' } } } } },
      { $sort: { _id: 1 } }
    ]).toArray()

    const activeDates = streakResults.map((r: any) => r._id).filter(Boolean)
    const activeSet = new Set(activeDates)

    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0
    const dateKey = (d: Date) => d.toISOString().slice(0, 10)
    const cursor = new Date(startDate)
    while (cursor <= now) {
      const d = dateKey(cursor)
      if (activeSet.has(d)) {
        tempStreak++
        longestStreak = Math.max(longestStreak, tempStreak)
      } else {
        tempStreak = 0
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    const today = dateKey(now)
    for (let i = activeDates.length - 1; i >= 0; i--) {
      if (activeDates[i] <= today) {
        if (activeSet.has(activeDates[i])) {
          currentStreak++
        } else {
          break
        }
      }
    }

    const hackathonCount = await db.collection('hackathon_teams').countDocuments({
      'members.user_id': userId,
    })

    const badges = BADGES.map(badge => {
      let progress = 0
      let total = badge.threshold
      let earned = false

      switch (badge.type) {
        case 'problems':
          progress = totalSolved
          break
        case 'language':
          progress = langCounts[badge.language || ''] || 0
          break
        case 'streak':
          progress = longestStreak
          break
        case 'hackathon':
          progress = hackathonCount
          break
      }

      earned = progress >= total

      let earnedAt: string | null = null
      if (earned) {
        if (badge.type === 'streak') {
          earnedAt = now.toISOString()
        } else if (badge.type === 'hackathon') {
          earnedAt = now.toISOString()
        } else {
          earnedAt = now.toISOString()
        }
      }

      return {
        id: badge.id,
        name: badge.name,
        icon: badge.icon,
        description: badge.description,
        earned,
        progress: Math.min(progress, total),
        total,
        earned_at: earnedAt,
      }
    })

    return NextResponse.json({ badges })
  } catch (e) {
    console.error('[skill-badges] error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

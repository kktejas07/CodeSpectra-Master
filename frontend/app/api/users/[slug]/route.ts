/**
 * GET /api/users/[slug]
 *
 * Public profile (for signed-in viewers). `slug` is the user's `username`
 * or their user `id` — never an email. The response carries no email or
 * role. Solved counts cover all accepted submissions, not just recent ones.
 */
import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { getUserXp } from '@/lib/db/leaderboard'
import { requireAuth } from '@/lib/route-auth'
import { sanitizeRegex } from '@/lib/sanitize'

export const runtime = 'nodejs'

interface UserDoc {
  id?: string
  username?: string
  name?: string
  fullName?: string
  preferredLanguage?: string
  createdAt?: string | Date
  created_at?: string | Date
}

interface SubmissionRow {
  id: string
  problem_id: string
  status: string
  score: number
  language: string
  created_at: string
}

interface ProblemRow {
  id: string
  slug: string
  title: string
  difficulty: string
}

const SLUG_RE = /^[A-Za-z0-9._-]{1,64}$/

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'Sign in required to view profiles' }, { status: 401 })
  }
  const { slug } = await ctx.params
  const decoded = decodeURIComponent(slug || '').trim()
  if (!decoded || !SLUG_RE.test(decoded)) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  const db = await getMongoDb()
  const users = db.collection<UserDoc>('user')
  const projection = { _id: 0, id: 1, username: 1, name: 1, fullName: 1, preferredLanguage: 1, createdAt: 1, created_at: 1 }

  const user =
    (await users.findOne({ id: decoded }, { projection })) ||
    (await users.findOne({ username: decoded }, { projection })) ||
    (await users.findOne({ username: { $regex: `^${sanitizeRegex(decoded)}$`, $options: 'i' } }, { projection }))

  if (!user?.id) return NextResponse.json({ error: 'user not found' }, { status: 404 })

  const userId = String(user.id)
  const submissions = db.collection<SubmissionRow>('submissions')
  const [xp, recent, totalSubmissions, solvedProblemIds] = await Promise.all([
    getUserXp(userId),
    submissions
      .find({ user_id: userId }, { projection: { _id: 0, source_code: 0, results: 0, stderr_excerpt: 0 } })
      .sort({ created_at: -1 })
      .limit(20)
      .toArray(),
    submissions.countDocuments({ user_id: userId }),
    submissions.distinct('problem_id', { user_id: userId, status: 'accepted' }) as Promise<string[]>,
  ])

  const problemIds = [...new Set([...recent.map((s) => s.problem_id), ...solvedProblemIds])]
  const problems = db.collection<ProblemRow>('problems')
  const probDocs = problemIds.length
    ? await problems.find({ id: { $in: problemIds } }, { projection: { _id: 0, id: 1, slug: 1, title: 1, difficulty: 1 } }).toArray()
    : []
  const probById = new Map(probDocs.map((p) => [p.id, p]))

  const byDifficulty = { easy: 0, medium: 0, hard: 0 }
  for (const pid of solvedProblemIds) {
    const p = probById.get(pid)
    if (p && byDifficulty[p.difficulty as keyof typeof byDifficulty] !== undefined) {
      byDifficulty[p.difficulty as keyof typeof byDifficulty] += 1
    }
  }

  const handle = user.username || userId
  const joined = user.createdAt || user.created_at

  return NextResponse.json({
    user: {
      id: userId,
      slug: handle,
      name: (user.fullName || user.name || '').trim() || 'Developer',
      preferredLanguage: user.preferredLanguage || 'javascript',
      joinedAt: joined ? new Date(joined).toISOString() : null,
    },
    stats: {
      xp,
      totalSubmissions,
      solved: solvedProblemIds.length,
      byDifficulty,
    },
    recent: recent.map((s) => ({
      id: s.id,
      status: s.status,
      score: s.score,
      language: s.language,
      created_at: s.created_at,
      problem: probById.get(s.problem_id)
        ? {
            slug: probById.get(s.problem_id)!.slug,
            title: probById.get(s.problem_id)!.title,
            difficulty: probById.get(s.problem_id)!.difficulty,
          }
        : null,
    })),
  })
}

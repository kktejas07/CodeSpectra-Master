/**
 * GET /api/users/[slug]
 *
 * Public-ish profile endpoint. `slug` can be either the user `id` or the
 * email local-part (text before `@`). Returns profile + XP + recent solves.
 */
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { getUserXp } from '@/lib/db/leaderboard'

export const runtime = 'nodejs'

interface UserDoc {
  _id: ObjectId | string
  email?: string
  name?: string
  fullName?: string
  role?: string
  preferredLanguage?: string
  createdAt?: string
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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  const decoded = decodeURIComponent(slug || '').trim()
  if (!decoded) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 })
  }

  const db = await getMongoDb()
  const users = db.collection('user')

  // Try id, email-localpart prefix, then case-insensitive name match.
  const user = ((await (ObjectId.isValid(decoded)
    ? users.findOne({ _id: new ObjectId(decoded) })
    : Promise.resolve(null))) ||
    (await users.findOne({ email: { $regex: `^${decoded}@`, $options: 'i' } })) ||
    (await users.findOne({ email: decoded.toLowerCase() }))) as UserDoc | null

  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 })

  const userId =
    typeof user._id === 'string' ? user._id : user._id.toHexString()
  const xp = await getUserXp(userId)

  const submissions = db.collection<SubmissionRow>('submissions')
  const recent = await submissions
    .find({ user_id: userId }, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .limit(20)
    .toArray()

  const problemIds = [...new Set(recent.map((s) => s.problem_id))]
  const problems = db.collection<ProblemRow>('problems')
  const probDocs = problemIds.length
    ? await problems.find({ id: { $in: problemIds } }).toArray()
    : []
  const probById = new Map(probDocs.map((p) => [p.id, p]))

  // Aggregate: total accepted, per-difficulty counts.
  const acceptedRows = recent.filter((s) => s.status === 'accepted')
  const solvedProblemIds = [...new Set(acceptedRows.map((s) => s.problem_id))]
  const byDifficulty = { easy: 0, medium: 0, hard: 0 }
  for (const pid of solvedProblemIds) {
    const p = probById.get(pid)
    if (p && byDifficulty[p.difficulty as keyof typeof byDifficulty] !== undefined) {
      byDifficulty[p.difficulty as keyof typeof byDifficulty] += 1
    }
  }

  const email = user.email || ''
  const displayName = (user.fullName || user.name || '').trim() ||
    (email ? email.split('@')[0] : 'Developer')

  return NextResponse.json({
    user: {
      id: userId,
      slug: email ? email.split('@')[0] : userId,
      name: displayName,
      email,
      role: user.role || 'user',
      preferredLanguage: user.preferredLanguage || 'javascript',
      joinedAt: user.createdAt || null,
    },
    stats: {
      xp,
      totalSubmissions: recent.length,
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

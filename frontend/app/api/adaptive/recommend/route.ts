import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Elo-based adaptive question recommendation.
 *
 * Each problem has an Elo rating (difficulty). Each user has an ability rating.
 * The system recommends problems slightly above the user's current ability
 * to maximize learning (zone of proximal development).
 *
 * Elo formulas:
 *   Expected score: Ea = 1 / (1 + 10^((Rb - Ra) / 400))
 *   Update: Ra_new = Ra + K * (Sa - Ea)
 *   K = 32 (standard), Sa = actual score (1 for solved, 0 for failed)
 */

interface ProblemDoc {
  id: string
  slug: string
  title: string
  difficulty: string
  topics: string[]
  elo_rating: number
}

interface UserAbility {
  user_id: string
  ability: number // Elo-style rating (starts at 1200)
  solved: string[] // slugs of solved problems
  topic_ratings: Record<string, number> // per-topic ability
  updated_at: string
}

async function getUserAbility(db: Awaited<ReturnType<typeof getMongoDb>>, userId: string): Promise<UserAbility> {
  const col = db.collection('user_abilities')
  const existing = await col.findOne({ user_id: userId })
  if (existing) return existing as unknown as UserAbility

  const ability: UserAbility = {
    user_id: userId,
    ability: 1200, // starting Elo
    solved: [],
    topic_ratings: {},
    updated_at: new Date().toISOString(),
  }
  await col.insertOne(ability as any)
  return ability
}

function expectedScore(userRating: number, problemRating: number): number {
  return 1 / (1 + Math.pow(10, (problemRating - userRating) / 400))
}

function updateRating(currentRating: number, expected: number, actual: number, k: number = 32): number {
  return Math.round(currentRating + k * (actual - expected))
}

function difficultyToElo(difficulty: string): number {
  switch (difficulty) {
    case 'easy': return 1000
    case 'medium': return 1400
    case 'hard': return 1800
    default: return 1200
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await req.json().catch(() => ({})) as {
    problem_slug?: string
    solved?: boolean
    topic?: string
    count?: number
  }

  try {
    const db = await getMongoDb()

    // Update user ability if they just solved/failed a problem
    if (body.problem_slug && body.solved !== undefined) {
      const ability = await getUserAbility(db, gate.user.id)

      const problemsCol = db.collection('problems')
      const problem = await problemsCol.findOne({ slug: body.problem_slug }) as unknown as ProblemDoc | null

      if (problem) {
        const problemRating = problem.elo_rating || difficultyToElo(problem.difficulty)
        const userRating = ability.ability
        const expected = expectedScore(userRating, problemRating)
        const actual = body.solved ? 1 : 0
        const newRating = updateRating(userRating, expected, actual)

        // Update per-topic rating
        const topic = body.topic || problem.topics?.[0] || 'general'
        const topicRating = ability.topic_ratings[topic] || 1200
        const topicExpected = expectedScore(topicRating, problemRating)
        const newTopicRating = updateRating(topicRating, topicExpected, actual)

        const solvedList = body.solved && !ability.solved.includes(body.problem_slug)
          ? [...ability.solved, body.problem_slug]
          : ability.solved

        await db.collection('user_abilities').updateOne(
          { user_id: gate.user.id },
          {
            $set: {
              ability: newRating,
              solved: solvedList,
              [`topic_ratings.${topic}`]: newTopicRating,
              updated_at: new Date().toISOString(),
            },
          },
          { upsert: true }
        )
      }
    }

    // Get user's current ability
    const ability = await getUserAbility(db, gate.user.id)

    // Recommend problems:
    // 1. Not already solved
    // 2. Difficulty slightly above user's ability (zone of proximal development)
    // 3. Sorted by expected learning value
    const problemsCol = db.collection('problems')
    const allProblems = await problemsCol
      .find({ visibility: { $ne: 'hidden' } })
      .project({ slug: 1, title: 1, difficulty: 1, topics: 1, elo_rating: 1 })
      .toArray() as unknown as ProblemDoc[]

    const unsolved = allProblems.filter(p => !ability.solved.includes(p.slug))

    // Score each problem by expected learning value
    // Optimal = difficulty slightly above user ability (expected score ~0.6-0.7)
    const scored = unsolved.map(p => {
      const problemRating = p.elo_rating || difficultyToElo(p.difficulty)
      const expected = expectedScore(ability.ability, problemRating)
      // Learning value is highest when expected score is ~0.65 (not too easy, not too hard)
      const learningValue = 1 - Math.abs(expected - 0.65)
      return {
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        topics: p.topics,
        elo_rating: problemRating,
        expected_score: Math.round(expected * 100) / 100,
        learning_value: Math.round(learningValue * 100) / 100,
      }
    })

    // Sort by learning value descending
    scored.sort((a, b) => b.learning_value - a.learning_value)

    const count = Math.min(20, Math.max(1, body.count || 10))

    return NextResponse.json({
      user_ability: ability.ability,
      topic_ratings: ability.topic_ratings,
      solved_count: ability.solved.length,
      recommendations: scored.slice(0, count),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Adaptive engine failed'
    console.error('[CodeSpectra] adaptive-recommend:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET: Fetch user's current ability rating
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const ability = await getUserAbility(db, gate.user.id)
    return NextResponse.json(ability)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch ability'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

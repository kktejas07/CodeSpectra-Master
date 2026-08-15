import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Role-to-problem mapping.
 * Each role maps to specific topics, difficulty ranges, and problem categories.
 * The API returns problems filtered and ranked for the given role.
 */

interface RoleConfig {
  id: string
  title: string
  topics: string[]
  difficultyRange: [string, string] // min, max
  categories: string[]
  description: string
}

const ROLE_CONFIGS: Record<string, RoleConfig> = {
  'software-engineer': {
    id: 'software-engineer',
    title: 'Software Engineer',
    topics: ['algorithms', 'data-structures', 'arrays', 'strings', 'trees', 'graphs', 'dynamic-programming', 'sorting', 'searching', 'recursion'],
    difficultyRange: ['easy', 'hard'],
    categories: ['Arrays', 'Strings', 'Trees', 'Graphs', 'Dynamic Programming', 'Stacks', 'Linked Lists'],
    description: 'Full-stack problem solving with emphasis on algorithms and data structures',
  },
  'frontend-developer': {
    id: 'frontend-developer',
    title: 'Frontend Developer',
    topics: ['dom', 'css', 'javascript', 'react', 'html', 'accessibility', 'responsive-design', 'event-handling', 'state-management'],
    difficultyRange: ['easy', 'medium'],
    categories: ['DOM Manipulation', 'CSS Layout', 'JavaScript Basics', 'React', 'Accessibility'],
    description: 'UI/UX focused problems covering DOM, CSS, JavaScript, and React',
  },
  'backend-developer': {
    id: 'backend-developer',
    title: 'Backend Developer',
    topics: ['api-design', 'databases', 'authentication', 'system-design', 'concurrency', 'caching', 'microservices', 'security'],
    difficultyRange: ['medium', 'hard'],
    categories: ['System Design', 'API Design', 'Database', 'Security', 'Concurrency'],
    description: 'Server-side problems covering APIs, databases, and system design',
  },
  'data-engineer': {
    id: 'data-engineer',
    title: 'Data Engineer',
    topics: ['sql', 'data-pipeline', 'etl', 'spark', 'data-modeling', 'streaming', 'batch-processing'],
    difficultyRange: ['medium', 'hard'],
    categories: ['SQL', 'Data Pipeline', 'Data Modeling', 'Stream Processing'],
    description: 'Data pipeline and processing problems',
  },
  'devops-engineer': {
    id: 'devops-engineer',
    title: 'DevOps Engineer',
    topics: ['docker', 'kubernetes', 'ci-cd', 'monitoring', 'infrastructure', 'linux', 'scripting'],
    difficultyRange: ['easy', 'medium'],
    categories: ['Scripting', 'Infrastructure', 'CI/CD', 'Monitoring'],
    description: 'Infrastructure and automation problems',
  },
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const roleId = req.nextUrl.searchParams.get('role') || ''
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 20))

  if (!roleId) {
    return NextResponse.json({
      roles: Object.values(ROLE_CONFIGS).map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        topic_count: r.topics.length,
      })),
    })
  }

  const config = ROLE_CONFIGS[roleId]
  if (!config) {
    return NextResponse.json({ error: `Unknown role: ${roleId}. Valid roles: ${Object.keys(ROLE_CONFIGS).join(', ')}` }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const problems = db.collection('problems')

    // Fetch problems matching this role's categories
    const query = {
      $or: [
        { topics: { $in: config.topics } },
        { category: { $in: config.categories } },
      ],
    }

    const matched = await problems
      .find(query)
      .limit(200)
      .toArray()

    // Filter by difficulty range
    const diffOrder = ['easy', 'medium', 'hard']
    const minIdx = diffOrder.indexOf(config.difficultyRange[0])
    const maxIdx = diffOrder.indexOf(config.difficultyRange[1])

    const filtered = matched.filter(p => {
      const idx = diffOrder.indexOf(p.difficulty)
      return idx >= minIdx && idx <= maxIdx
    })

    // Score by relevance to role
    const scored = filtered.map(p => {
      const topicOverlap = (p.topics || []).filter((t: string) => config.topics.includes(t)).length
      const categoryMatch = config.categories.includes(p.category) ? 2 : 0
      const relevanceScore = topicOverlap + categoryMatch

      return {
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        category: p.category,
        topics: p.topics,
        relevance_score: relevanceScore,
      }
    })

    // Sort by relevance descending
    scored.sort((a, b) => b.relevance_score - a.relevance_score)

    return NextResponse.json({
      role: config,
      problems: scored.slice(0, limit),
      total: scored.length,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Role mapping failed'
    console.error('[CodeSpectra] role-problems:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

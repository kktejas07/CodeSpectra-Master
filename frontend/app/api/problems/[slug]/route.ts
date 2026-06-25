import { NextResponse } from 'next/server'
import { problems } from '@/lib/db/problems'
import { SEED_PROBLEMS } from '@/lib/db/seed-problems'

/**
 * GET /api/problems/[slug]
 * Returns the full problem doc INCLUDING starter code and sample test cases
 * but EXCLUDING hidden test cases (we only ship `is_sample: true` ones).
 *
 * If MongoDB is unavailable (no MONGODB_URI), falls back to the seed list
 * so the arena UI remains usable in demo mode.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params

  // Try Mongo first
  try {
    const col = await problems()
    const doc = await col.findOne({ slug })
    if (doc) {
      return NextResponse.json({
        ...doc,
        test_cases: (doc.test_cases || []).filter((t) => t.is_sample),
        hidden_test_count:
          (doc.test_cases || []).length -
          (doc.test_cases || []).filter((t) => t.is_sample).length,
      })
    }
  } catch (error) {
    console.warn('[CodeSpectra] problem GET (mongo unavailable, using seed):', error)
  }

  // Fallback: in-memory seed
  const seed = SEED_PROBLEMS.find((p) => p.slug === slug)
  if (!seed) {
    return NextResponse.json({ error: 'Problem not found' }, { status: 404 })
  }
  return NextResponse.json({
    ...seed,
    test_cases: seed.test_cases.filter((t) => t.is_sample),
    hidden_test_count: seed.test_cases.length - seed.test_cases.filter((t) => t.is_sample).length,
    _source: 'seed',
  })
}

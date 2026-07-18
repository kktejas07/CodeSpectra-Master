import { NextResponse } from 'next/server'
import { problems, submissions } from '@/lib/db/problems'

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params

  try {
    const pCol = await problems()
    const problem = await pCol.findOne({ $or: [{ slug }, { id: slug }] })
    if (!problem) {
      return NextResponse.json({ error: 'Problem not found' }, { status: 404 })
    }

    const sCol = await submissions()
    const [total, accepted] = await Promise.all([
      sCol.countDocuments({ problem_id: problem.id }),
      sCol.countDocuments({ problem_id: problem.id, status: 'accepted' }),
    ])

    return NextResponse.json({
      problem_id: problem.id,
      total_submissions: total,
      accepted_submissions: accepted,
      acceptance_rate: total > 0 ? Math.round((accepted / total) * 100) : null,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}
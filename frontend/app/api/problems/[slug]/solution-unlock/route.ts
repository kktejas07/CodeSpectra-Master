/**
 * POST /api/problems/[slug]/solution-unlock — pay AI credits to reveal the
 * official solution before attempting the problem.
 *
 * Attempting it (any submission, right or wrong) unlocks it for free — this
 * exists only for learners who want to study the solution first. The charge is
 * refunded if the unlock record cannot be written.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { problems, submissions, solutionUnlocks, nowIso, newId } from '@/lib/db/problems'
import { chargeAiFeature, outOfCredits } from '@/lib/user-credits'

export const runtime = 'nodejs'

export async function POST(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { slug } = await ctx.params

  const problem = await (await problems()).findOne({ $or: [{ slug }, { id: slug }] }, { projection: { id: 1, official_solution: 1 } })
  if (!problem) return NextResponse.json({ error: 'Problem not found', code: 'problem_not_found' }, { status: 404 })
  if (!problem.official_solution) return NextResponse.json({ error: 'This problem has no official solution yet', code: 'solution_missing' }, { status: 409 })

  // Already unlocked (attempted or paid earlier) — never charge twice.
  const [attempt, existing] = await Promise.all([
    (await submissions()).findOne({ user_id: gate.user.id, problem_id: problem.id }, { projection: { _id: 1 } }),
    (await solutionUnlocks()).findOne({ user_id: gate.user.id, problem_id: problem.id }, { projection: { _id: 1 } }),
  ])
  if (attempt || existing) return NextResponse.json({ ok: true, already: true })

  const charge = await chargeAiFeature(gate.user.id, 'solution_unlock')
  if (!charge.ok) return NextResponse.json(outOfCredits(charge), { status: 402 })

  try {
    await (await solutionUnlocks()).insertOne({
      id: newId(),
      user_id: gate.user.id,
      problem_id: problem.id,
      credits: charge.cost,
      created_at: nowIso(),
    })
  } catch (e) {
    console.error('[solution-unlock] save failed:', e)
    await charge.refund()
    return NextResponse.json({ error: 'Something went wrong. Try again.', code: 'server_error_retry' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, credits: charge.cost, balance: charge.balance })
}

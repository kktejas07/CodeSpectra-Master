import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { hackathonSubmissions, hackathons, nowIso } from '@/lib/db/qr-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ hackathonId: string; submissionId: string }> },
) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { hackathonId, submissionId } = await ctx.params
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id: hackathonId }, { slug: hackathonId }] })
  if (!hk) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const isSuperadmin = (user.role || '').toLowerCase() === 'superadmin'
  const isJudge = (hk.judges || []).includes(user.id)
  if (!isSuperadmin && !isJudge) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { score?: number; feedback?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (body.score == null || typeof body.score !== 'number') {
    return NextResponse.json({ error: 'score required' }, { status: 400 })
  }

  const score = Math.min(100, Math.max(0, Math.round(body.score)))
  const feedback = (body.feedback || '').trim()
  const now = nowIso()

  const subsCol = await hackathonSubmissions()
  const sub = await subsCol.findOne({ id: submissionId, hackathon_id: hk.id })
  if (!sub) return NextResponse.json({ error: 'submission not found' }, { status: 404 })

  const $set: Record<string, unknown> = {
    score,
    feedback,
    reviewed_at: now,
  }
  if (sub.status === 'pending') {
    $set.status = 'under_review'
  }

  const scoreEntry = {
    judge_id: user.id,
    score,
    feedback,
    created_at: now,
  }

  await subsCol.updateOne(
    { id: submissionId },
    { $set, $push: { scores: scoreEntry } },
  )

  return NextResponse.json({ ok: true })
}

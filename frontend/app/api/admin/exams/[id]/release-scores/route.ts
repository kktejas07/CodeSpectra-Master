import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { releaseExamScores } from '@/lib/services/exam-release'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: examId } = await ctx.params
  const body = await req.json().catch(() => ({})) as { cutoff?: number }

  try {
    // Tenant check, pass mark, certificates and notifications: lib/services/exam-release (shared with the admin agent).
    const r = await releaseExamScores(gate.user, examId, body.cutoff)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r.data)
  } catch (e: unknown) {
    console.error('[release-scores] error:', e)
    return NextResponse.json({ error: 'Failed to release scores' }, { status: 500 })
  }
}

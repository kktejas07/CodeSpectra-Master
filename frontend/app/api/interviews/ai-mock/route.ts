/**
 * GET /api/interviews/ai-mock            → your past AI mock interviews (newest first, ≤ 50)
 * GET /api/interviews/ai-mock?id=<id>    → one session with its report and transcript
 *
 * CORE-016: reports used to live only in sessionStorage; the server already
 * saved every session, so they can be reopened from any tab or device.
 * Own sessions only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Doc = Record<string, unknown>

function summary(d: Doc) {
  const report = (d.report && typeof d.report === 'object' ? d.report : null) as { overallScore?: unknown; category?: unknown } | null
  const scores = Array.isArray(d.scores) ? (d.scores as Array<{ score?: unknown }>) : []
  const avg = scores.length ? Math.round((scores.reduce((a, s) => a + (Number(s.score) || 0), 0) / scores.length) * 10) : null
  return {
    id: String(d.id),
    role: typeof d.role === 'string' ? d.role : '',
    difficulty: typeof d.difficulty === 'string' ? d.difficulty : '',
    status: d.status === 'completed' ? 'completed' : 'active',
    started_at: typeof d.startedAt === 'number' ? new Date(d.startedAt).toISOString() : null,
    completed_at: typeof d.completedAt === 'number' ? new Date(d.completedAt).toISOString() : null,
    turns: Number(d.turnCount) || 0,
    overall_score: typeof report?.overallScore === 'number' ? report.overallScore : avg,
    category: typeof report?.category === 'string' ? report.category : null,
    has_report: !!report,
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const id = req.nextUrl.searchParams.get('id')
  try {
    const col = (await getMongoDb()).collection('ai_mock_sessions')
    if (id) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
      const d = (await col.findOne({ id, userId: gate.user.id }, { projection: { _id: 0, resume: 0, resumeSource: 0 } })) as Doc | null
      if (!d) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
      const history = Array.isArray(d.conversationHistory) ? (d.conversationHistory as Array<{ role?: unknown; text?: unknown; timestamp?: unknown }>) : []
      return NextResponse.json({
        session: summary(d),
        report: d.report ?? null,
        transcript: history.slice(0, 200).map((h) => ({ role: h.role === 'ai' ? 'ai' : 'user', text: String(h.text ?? '').slice(0, 4000), timestamp: Number(h.timestamp) || null })),
      })
    }
    const rows = (await col.find({ userId: gate.user.id }, { projection: { _id: 0, id: 1, role: 1, difficulty: 1, status: 1, startedAt: 1, completedAt: 1, turnCount: 1, scores: 1, 'report.overallScore': 1, 'report.category': 1 } })
      .sort({ startedAt: -1 })
      .limit(50)
      .toArray()) as Doc[]
    return NextResponse.json({ sessions: rows.map(summary) })
  } catch (e) {
    console.error('[ai-mock] list error:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not load your practice interviews' }, { status: 500 })
  }
}

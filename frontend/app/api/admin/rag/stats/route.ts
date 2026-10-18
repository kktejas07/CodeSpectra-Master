/**
 * Legacy /api/admin/rag/stats (superadmin RAG page) — thin wrapper over the
 * knowledge layer (lib/rag). New UI: /dashboard/admin/knowledge.
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { callerFromUser, knowledgeStats } from '@/lib/rag/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const caller = callerFromUser(gate.user)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const s = await knowledgeStats(caller)
    return NextResponse.json({
      total: s.chunks,
      bySource: Object.fromEntries(s.by_type.map((t) => [t.type, t.chunks])),
      ...s,
    })
  } catch (e) {
    console.error('[CodeSpectra] admin/rag/stats:', e)
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 })
  }
}

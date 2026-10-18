/**
 * Legacy /api/admin/rag/reindex (superadmin) — queues a full knowledge sweep
 * (lib/rag) and works the queue after the response. Unchanged sources are
 * skipped by content hash. New UI: /dashboard/admin/knowledge.
 */
import { after, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { callerFromUser, reindexScope } from '@/lib/rag/admin'
import { processKnowledgeQueue } from '@/lib/rag/ingest'

export const dynamic = 'force-dynamic'

export async function POST() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const caller = callerFromUser(gate.user)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const res = await reindexScope(caller, {})
    await auditAdmin({ id: caller.userId }, 'knowledge.reindex', 'knowledge', 'platform', JSON.stringify(res.byType))
    after(() => processKnowledgeQueue({ budgetMs: 50_000 }).catch((e) => console.error('[rag] reindex kick failed:', e)))
    return NextResponse.json({ ok: true, count: res.queued, queued: res.queued, byType: res.byType })
  } catch (e) {
    console.error('[CodeSpectra] admin/rag/reindex:', e)
    return NextResponse.json({ ok: false, error: 'Reindex failed' }, { status: 500 })
  }
}

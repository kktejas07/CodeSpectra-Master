/**
 * Legacy /api/admin/rag/reindex (superadmin) — queues a full knowledge sweep
 * (lib/rag) and works the queue after the response. Unchanged sources are
 * skipped by content hash. New UI: /dashboard/admin/knowledge.
 */
import { after, NextResponse } from 'next/server'
import { requireSuperAdminOrInternal } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { callerFromUser, reindexScope } from '@/lib/rag/admin'
import { processKnowledgeQueue } from '@/lib/rag/ingest'

export const dynamic = 'force-dynamic'

/** System caller used when the request comes from internal automation (no session). */
const AUTOMATION_CALLER = { userId: 'system', role: 'superadmin' as const, tenantId: null, name: 'Automation', email: 'system@internal' }

export async function POST(request: Request) {
  const gate = await requireSuperAdminOrInternal(request)
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const caller = 'internal' in gate && gate.internal ? AUTOMATION_CALLER : callerFromUser(gate.user)
  if (!caller) return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
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

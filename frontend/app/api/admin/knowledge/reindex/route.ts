/**
 * POST /api/admin/knowledge/reindex  { types?, force?, tenant? }
 *   Queue a sweep and start working the queue right after the response.
 *   Superadmin: everything (or one tenant); tenant admins: their organisation's sources only.
 */
import { after, NextResponse } from 'next/server'
import { auditAdmin } from '@/lib/admin-audit'
import { reindexScope } from '@/lib/rag/admin'
import { processKnowledgeQueue } from '@/lib/rag/ingest'
import { knowledgeError, knowledgeGate, knowledgeLimit } from '@/lib/rag/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const g = await knowledgeGate()
  if ('response' in g) return g.response
  const limited = knowledgeLimit(g.caller, 'reindex', 5, 10 * 60_000)
  if (limited) return limited
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const res = await reindexScope(g.caller, body)
    await auditAdmin({ id: g.caller.userId }, 'knowledge.reindex', 'knowledge', g.caller.tenantId ?? 'platform', JSON.stringify(res.byType))
    after(() => processKnowledgeQueue({ budgetMs: 50_000 }).catch((e) => console.error('[rag] reindex kick failed:', e)))
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    return knowledgeError(e, 'admin/knowledge/reindex')
  }
}

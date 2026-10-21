/**
 * Knowledge vector store (superadmin only) — docs/devops/09-RAG-Vector-Store.md.
 *
 *   GET  /api/admin/knowledge/vector-store
 *        → { status }   configured store, which store serves reads, backfill progress, outbox size
 *   POST /api/admin/knowledge/vector-store
 *        { action: 'backfill', dry_run?: boolean, model?: string, restart?: boolean }
 *            copy Mongo vectors into pgvector; resumable — call again until `done`
 *            (the scheduler tick also continues an unfinished run)
 *        { action: 'reset', model?: string }
 *            forget the backfill state → reads go back to Mongo
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auditAdmin } from '@/lib/admin-audit'
import { requireSuperAdmin } from '@/lib/route-auth'
import { callerFromUser } from '@/lib/rag/admin'
import { knowledgeError, knowledgeLimit } from '@/lib/rag/route-helpers'
import { dominantEmbeddingModel } from '@/lib/rag/ingest'
import { BackfillError, resetBackfill, runBackfill, vectorStoreStatus } from '@/lib/rag/vector-store/backfill'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = z.string().trim().regex(/^[A-Za-z0-9._:/-]{1,80}$/).optional()
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('backfill'), dry_run: z.boolean().optional(), model: MODEL, restart: z.boolean().optional() }),
  z.object({ action: z.literal('reset'), model: MODEL }),
])

async function gate() {
  const g = await requireSuperAdmin()
  if ('error' in g) return { response: NextResponse.json({ error: g.error }, { status: g.status }) }
  const caller = callerFromUser(g.user)
  if (!caller || caller.role !== 'superadmin') return { response: NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 }) }
  return { caller }
}

function fail(e: unknown, where: string): NextResponse {
  if (e instanceof BackfillError) return NextResponse.json({ error: e.message }, { status: e.status })
  return knowledgeError(e, where)
}

export async function GET() {
  const g = await gate()
  if ('response' in g) return g.response
  try {
    return NextResponse.json({ status: await vectorStoreStatus() })
  } catch (e) {
    return fail(e, 'admin/knowledge/vector-store GET')
  }
}

export async function POST(request: Request) {
  const g = await gate()
  if ('response' in g) return g.response
  const limited = knowledgeLimit(g.caller, 'vector-store', 30, 10 * 60_000)
  if (limited) return limited
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const body = parsed.data
  try {
    if (body.action === 'reset') {
      const model = body.model || (await dominantEmbeddingModel())
      if (!model) return NextResponse.json({ error: 'There is no embedding model to reset.' }, { status: 400 })
      await resetBackfill(model)
      await auditAdmin({ id: g.caller.userId }, 'knowledge.vector_store.reset', 'knowledge', model)
      return NextResponse.json({ ok: true, status: await vectorStoreStatus() })
    }
    const result = await runBackfill({ dryRun: body.dry_run === true, model: body.model ?? null, restart: body.restart === true, budgetMs: 45_000 })
    if (!result.dry_run) {
      await auditAdmin({ id: g.caller.userId }, 'knowledge.vector_store.backfill', 'knowledge', result.state.model,
        JSON.stringify({ phase: result.state.phase, copied: result.state.copied, pruned: result.state.pruned, done: result.done }))
    }
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    return fail(e, 'admin/knowledge/vector-store POST')
  }
}

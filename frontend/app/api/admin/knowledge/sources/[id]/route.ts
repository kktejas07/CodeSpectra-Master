/**
 * /api/admin/knowledge/sources/[id]   (id = "<type>:<sourceId>", URL-encoded)
 *   POST   -> reindex this source now (force re-embed)
 *   DELETE -> delete an uploaded document and its chunks (uploads only)
 * Tenant admins: their organisation's sources only.
 */
import { NextResponse } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { auditAdmin } from '@/lib/admin-audit'
import { deleteSource, reindexOne } from '@/lib/rag/admin'
import { knowledgeError, knowledgeGate, knowledgeLimit } from '@/lib/rag/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID_RE = /^[a-z_]{2,40}:[A-Za-z0-9:._/-]{1,300}$/

async function sourceId(ctx: IdRouteContext): Promise<string | null> {
  const raw = decodeURIComponent((await ctx.params).id || '')
  return ID_RE.test(raw) ? raw : null
}

export async function POST(_request: Request, ctx: IdRouteContext) {
  const g = await knowledgeGate()
  if ('response' in g) return g.response
  const limited = knowledgeLimit(g.caller, 'reindex-one', 30, 60_000)
  if (limited) return limited
  const id = await sourceId(ctx)
  if (!id) return NextResponse.json({ error: 'Invalid source id' }, { status: 400 })
  try {
    const res = await reindexOne(g.caller, id)
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    return knowledgeError(e, 'admin/knowledge/sources/[id] POST')
  }
}

export async function DELETE(_request: Request, ctx: IdRouteContext) {
  const g = await knowledgeGate()
  if ('response' in g) return g.response
  const id = await sourceId(ctx)
  if (!id) return NextResponse.json({ error: 'Invalid source id' }, { status: 400 })
  try {
    await deleteSource(g.caller, id)
    await auditAdmin({ id: g.caller.userId }, 'knowledge.delete', 'knowledge_source', id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return knowledgeError(e, 'admin/knowledge/sources/[id] DELETE')
  }
}

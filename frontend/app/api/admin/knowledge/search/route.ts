/**
 * POST /api/admin/knowledge/search  { query, types?, limit?, tenant? }
 *   "Try a search": hybrid search with the caller's ACL. `tenant` narrows for superadmin only.
 */
import { NextResponse } from 'next/server'
import { searchKnowledge } from '@/lib/rag/search'
import { logSearch } from '@/lib/rag/admin'
import { isKnowledgeSourceType } from '@/lib/rag/types'
import { knowledgeError, knowledgeGate, knowledgeLimit } from '@/lib/rag/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const g = await knowledgeGate()
  if ('response' in g) return g.response
  const limited = knowledgeLimit(g.caller, 'search', 30, 60_000)
  if (limited) return limited
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 500) : ''
  if (!query) return NextResponse.json({ error: 'Type something to search for.' }, { status: 400 })
  const types = Array.isArray(body.types) ? body.types.filter(isKnowledgeSourceType) : undefined
  try {
    const hits = await searchKnowledge({
      caller: g.caller,
      query,
      types,
      limit: Number(body.limit) || 8,
      tenantId: g.caller.role === 'superadmin' && typeof body.tenant === 'string' ? body.tenant : null,
    })
    void logSearch(g.caller, hits.length, 'admin')
    return NextResponse.json({ hits })
  } catch (e) {
    return knowledgeError(e, 'admin/knowledge/search')
  }
}

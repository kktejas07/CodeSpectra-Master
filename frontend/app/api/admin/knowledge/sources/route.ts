/**
 * GET /api/admin/knowledge/sources?type=&status=&q=&tenant=&page=&pageSize=
 *   Knowledge sources (index state). Tenant admins: their organisation only.
 *   Superadmin may narrow with tenant=platform|<tenantId>.
 */
import { NextResponse } from 'next/server'
import { listSources } from '@/lib/rag/admin'
import { knowledgeError, knowledgeGate } from '@/lib/rag/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const g = await knowledgeGate()
  if ('response' in g) return g.response
  try {
    const sp = new URL(request.url).searchParams
    const data = await listSources(g.caller, {
      type: sp.get('type'),
      status: sp.get('status'),
      search: sp.get('q'),
      tenant: sp.get('tenant'),
      page: Number(sp.get('page')) || 1,
      pageSize: Number(sp.get('pageSize')) || 25,
    })
    return NextResponse.json(data)
  } catch (e) {
    return knowledgeError(e, 'admin/knowledge/sources')
  }
}

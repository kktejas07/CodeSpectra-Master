/** GET /api/admin/knowledge/stats — coverage + usage for the caller's scope. */
import { NextResponse } from 'next/server'
import { knowledgeStats } from '@/lib/rag/admin'
import { knowledgeError, knowledgeGate } from '@/lib/rag/route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await knowledgeGate()
  if ('response' in g) return g.response
  try {
    return NextResponse.json(await knowledgeStats(g.caller))
  } catch (e) {
    return knowledgeError(e, 'admin/knowledge/stats')
  }
}

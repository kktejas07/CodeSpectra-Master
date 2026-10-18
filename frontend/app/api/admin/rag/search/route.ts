/**
 * Legacy /api/admin/rag/search (superadmin) — thin wrapper over
 * searchKnowledge (lib/rag/search.ts). Response keeps the old shape
 * ({ results: [{ text, source, score }] }) plus the new `hits`.
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { callerFromUser, logSearch } from '@/lib/rag/admin'
import { searchKnowledge } from '@/lib/rag/search'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const caller = callerFromUser(gate.user)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let query = ''
  try {
    const body = await request.json()
    query = String(body.query || '').trim().slice(0, 500)
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (!query) return NextResponse.json({ error: 'Query is required' }, { status: 400 })

  try {
    const hits = await searchKnowledge({ caller, query, limit: 10 })
    void logSearch(caller, hits.length, 'admin')
    return NextResponse.json({
      results: hits.map((h) => ({ text: h.snippet.replace(/\*\*/g, ''), source: `${h.source_type}:${h.title}`, score: h.score })),
      hits,
    })
  } catch (e) {
    console.error('[CodeSpectra] admin/rag/search:', e)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

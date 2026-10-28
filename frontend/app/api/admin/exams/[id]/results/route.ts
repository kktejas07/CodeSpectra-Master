import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getExamResults } from '@/lib/services/exam-results'

export async function GET(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params

  try {
    // Tenant check + result rows: lib/services/exam-results (shared with the admin agent).
    const r = await getExamResults(gate.user, id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r.data)
  } catch (e: unknown) {
    const msg = 'Failed to load results'
    console.error('[CodeSpectra] admin/exams/[id]/results GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

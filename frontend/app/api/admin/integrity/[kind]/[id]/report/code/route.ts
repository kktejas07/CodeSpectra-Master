/**
 * GET /api/admin/integrity/[kind]/[id]/report/code?q=<question>&a=<submission>&b=<submission>
 * The two answers of a similarity pair for the side-by-side view. Only
 * submissions that are in this test's report; staff only; audit-logged.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { loadStaffTarget } from '@/lib/integrity/service'
import { clusterCode } from '@/lib/integrity/similarity-job'
import { auditAdmin } from '@/lib/admin-audit'
import { errorBody } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { kind, id } = await ctx.params
  const sp = req.nextUrl.searchParams
  try {
    const t = await loadStaffTarget(gate.user, kind, id)
    if (!t.ok) return NextResponse.json(errorBody(t), { status: t.status })
    const r = await clusterCode(t.data, sp.get('q') || '', [sp.get('a') || '', sp.get('b') || ''])
    if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
    await auditAdmin(gate.user, 'integrity.code.view', t.data.kind, t.data.id, `${sp.get('a')} vs ${sp.get('b')}`)
    return NextResponse.json({ code: r.data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[admin/integrity/code] GET failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not load the answers' }, { status: 500 })
  }
}

/**
 * GET /api/admin/integrity/snapshots/[snapId] — one violation snapshot for a
 * reviewer: a short presigned redirect (S3) or the JPEG bytes (Mongo).
 * Staff of the snapshot's test / contest only; every view is audit-logged.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { snapshotForStaff } from '@/lib/integrity/service'
import { auditAdmin } from '@/lib/admin-audit'
import { errorBody } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ snapId: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { snapId } = await ctx.params
  try {
    const r = await snapshotForStaff(gate.user, snapId)
    if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
    await auditAdmin(gate.user, 'integrity.snapshot.view', 'integrity_snapshot', snapId)
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
    if ('url' in r.data) return NextResponse.redirect(r.data.url, { status: 302, headers })
    return new NextResponse(new Uint8Array(r.data.bytes), { headers: { ...headers, 'Content-Type': 'image/jpeg', 'Content-Length': String(r.data.bytes.length) } })
  } catch (e) {
    console.error('[admin/integrity/snapshot] GET failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not load the snapshot' }, { status: 500 })
  }
}

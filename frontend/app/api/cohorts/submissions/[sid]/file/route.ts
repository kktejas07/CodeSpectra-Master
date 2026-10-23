/** GET — download a submitted file (its learner or the cohort's staff): short presigned URL or an attachment. */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ sid: string }> }) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  const { sid } = await params
  if (!idOk(sid)) return errJson(404, 'File not found', 'cohort_file_missing')
  try {
    const { submissionFile } = await import('@/lib/cohorts/service')
    const r = await submissionFile(g.user, sid)
    if ('url' in r) return NextResponse.redirect(r.url, { status: 302, headers: { 'Cache-Control': 'private, no-store' } })
    const name = r.name.replace(/[^\w.\- ]/g, '_')
    return new Response(new Uint8Array(r.bytes), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } })
  } catch (e) { return errorResponse(e, 'cohort file') }
}

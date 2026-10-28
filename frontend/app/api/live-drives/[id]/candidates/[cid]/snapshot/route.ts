/** GET /api/live-drives/[id]/candidates/[cid]/snapshot?id=isnap_… — one camera still (staff of this candidate only). */
import { NextResponse } from 'next/server'
import { badId, handle, ID_RE } from '@/lib/live-drives/http'
import { candidateSnapshot } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string; cid: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { id, cid } = await params
  if (!ID_RE.test(id) || !ID_RE.test(cid)) return badId()
  return handle('snapshot', async (user) => {
    const r = await candidateSnapshot(user, id, cid, new URL(req.url).searchParams.get('id') || '')
    if ('url' in r) return NextResponse.redirect(r.url, { status: 302, headers: { 'Cache-Control': 'private, no-store' } })
    return new NextResponse(new Uint8Array(r.bytes), { headers: { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } })
  })
}

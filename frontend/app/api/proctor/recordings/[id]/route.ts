/**
 * GET /api/proctor/recordings/[id]?t=<token> — one decrypted proctoring video
 * chunk (lib/proctoring/recordings.ts). Staff only: the token is bound to the
 * viewer and valid 30 minutes; the caller must be that same signed-in admin,
 * and a tenant admin only for their own tenant's exam. Supports Range so the
 * player can seek inside a chunk. Never cached.
 */
import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { CHUNKS, parseRange, readChunkBytes, verifyChunkViewToken, type RecordingChunkDoc } from '@/lib/proctoring/recordings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOT_FOUND = () => NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params
  const tok = await verifyChunkViewToken(new URL(req.url).searchParams.get('t'))
  if (!tok || tok.chunkId !== id || tok.viewerId !== gate.user.id) {
    return NextResponse.json({ error: 'This link has expired. Reload the recording page.' }, { status: 403 })
  }
  try {
    const db = await getMongoDb()
    const doc = (await db.collection(CHUNKS).findOne({ id }, { projection: { _id: 0 } })) as RecordingChunkDoc | null
    if (!doc) return NOT_FOUND()
    const owned = await requireTenantEntity(db, 'exams', doc.exam_id, gate.user)
    if ('error' in owned) return NOT_FOUND()
    const bytes = await readChunkBytes(db, doc)
    if (!bytes) return NOT_FOUND()
    const headers: Record<string, string> = {
      'Content-Type': doc.mime.split(';')[0] || 'video/webm',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Accept-Ranges': 'bytes',
    }
    const range = parseRange(req.headers.get('range'), bytes.length)
    if (req.headers.get('range') && !range) {
      return new NextResponse(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${bytes.length}` } })
    }
    if (range) {
      const part = bytes.subarray(range.start, range.end + 1)
      return new NextResponse(new Uint8Array(part), {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${bytes.length}`, 'Content-Length': String(part.length) },
      })
    }
    return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, 'Content-Length': String(bytes.length) } })
  } catch (e) {
    console.error('[recordings] read failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not load the recording' }, { status: 500 })
  }
}

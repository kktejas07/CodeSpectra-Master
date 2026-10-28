/**
 * GET /api/identity-media/[id]?t=<token> — one exam identity photo (ID card
 * or selfie), decrypted on the fly (lib/identity-media.ts, audits A-011/A-042).
 *
 * The token is HMAC-signed, bound to the viewer's user id and valid 5 minutes;
 * staff get it from the submission review / proctor report APIs. Here we
 * re-check the caller: same signed-in user as the token, admin role, and
 * (tenant admins) the exam belongs to their tenant. Never cached.
 */
import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getMediaDoc, readMediaBytes, verifyMediaViewToken } from '@/lib/identity-media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOT_FOUND = () => NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params
  const tok = await verifyMediaViewToken(new URL(req.url).searchParams.get('t'))
  if (!tok || tok.mediaId !== id || tok.viewerId !== gate.user.id) {
    return NextResponse.json({ error: 'This link has expired. Reopen the candidate to view the photo.' }, { status: 403 })
  }
  try {
    const doc = await getMediaDoc(id)
    if (!doc) return NOT_FOUND()
    const owned = await requireTenantEntity(await getMongoDb(), 'exams', doc.exam_id, gate.user)
    if ('error' in owned) return NOT_FOUND()
    const bytes = await readMediaBytes(doc)
    if (!bytes) return NOT_FOUND()
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': doc.mime,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    })
  } catch (e) {
    console.error('[identity-media] read failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not load the photo' }, { status: 500 })
  }
}

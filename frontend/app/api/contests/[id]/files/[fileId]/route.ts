/**
 * GET /api/contests/[id]/files/[fileId] — download an uploaded deck / video /
 * diagram. Staff, judges, and members of the entry that uploaded it only.
 */
import { NextResponse } from 'next/server'
import { readContestFile } from '@/lib/contests/participation'
import { guarded, loadVisible, notFound, unauthorized, withUser } from '@/lib/contests/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const user = await withUser()
  if (!user) return unauthorized()
  const { id, fileId } = await ctx.params
  return guarded('file', async () => {
    const c = await loadVisible(id, user)
    if (!c) return notFound()
    const f = await readContestFile(user, c, fileId)
    if (!f || !f.data) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    // Stored as a BSON Binary (its .buffer is the bytes) or a Buffer.
    const raw = f.data as unknown
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array((raw as { buffer: Uint8Array }).buffer)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': f.mime,
        'Content-Disposition': `attachment; filename="${f.name.replace(/[^\w.\- ]/g, '_')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser, requireSuperAdmin } from '@/lib/route-auth'
import { ebooksCol, nowIso, type EbookStatus } from '@/lib/db/ebooks'
import { ensureEbookSeed } from '@/lib/ebooks-seed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureEbookSeed('system')
  const { slug } = await ctx.params
  const col = await ebooksCol()
  const doc = await col.findOne({ slug: decodeURIComponent(slug) })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (doc.status !== 'published' && user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    item: {
      id: doc.id,
      slug: doc.slug,
      title: doc.title,
      subtitle: doc.subtitle,
      description: doc.description,
      topic: doc.topic,
      coverTheme: doc.coverTheme,
      readMinutes: doc.readMinutes,
      pages: doc.pages,
      status: doc.status,
      sourceNote: doc.sourceNote,
      publishedAt: doc.publishedAt,
    },
  })
}

/** PATCH — publish / archive (superadmin) */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { slug } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const status = String(body.status || '') as EbookStatus
  if (!['draft', 'published', 'archived'].includes(status)) {
    return NextResponse.json({ error: 'status must be draft|published|archived' }, { status: 400 })
  }

  const col = await ebooksCol()
  const now = nowIso()
  const update: Record<string, unknown> = { status, updatedAt: now }
  if (status === 'published') update.publishedAt = now

  const res = await col.findOneAndUpdate(
    { slug: decodeURIComponent(slug) },
    { $set: update },
    { returnDocument: 'after' },
  )
  if (!res) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, item: { id: res.id, slug: res.slug, status: res.status } })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { slug } = await ctx.params
  const col = await ebooksCol()
  const r = await col.deleteOne({ slug: decodeURIComponent(slug) })
  if (!r.deletedCount) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

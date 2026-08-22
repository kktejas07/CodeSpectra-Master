import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser, requireSuperAdmin } from '@/lib/route-auth'
import { ebooksCol, type EbookDoc } from '@/lib/db/ebooks'
import { ensureEbookSeed } from '@/lib/ebooks-seed'
import { generateEbookDraft } from '@/lib/ebooks-generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function publicShape(e: EbookDoc) {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    subtitle: e.subtitle,
    description: e.description,
    topic: e.topic,
    coverTheme: e.coverTheme,
    readMinutes: e.readMinutes,
    status: e.status,
    pageCount: e.pages?.length || 0,
    publishedAt: e.publishedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }
}

/** GET — published ebooks for all users; ?all=1 for superadmin drafts too */
export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureEbookSeed('system')
  const col = await ebooksCol()
  const url = new URL(req.url)
  const wantAll = url.searchParams.get('all') === '1'
  const isSa = user.role === 'superadmin'

  const filter = wantAll && isSa ? {} : { status: 'published' as const }
  const rows = await col.find(filter).sort({ publishedAt: -1, createdAt: -1 }).limit(100).toArray()
  return NextResponse.json({ items: rows.map(publicShape) })
}

/** POST — superadmin generate (topic → draft ebook) */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await req.json().catch(() => ({}))
  const topic = String(body.topic || '').trim()
  if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 })

  const status = body.publish === true ? 'published' : 'draft'
  const { ebook, usedAi } = await generateEbookDraft({
    topic,
    title: body.title ? String(body.title) : undefined,
    status,
    createdBy: auth.user.id,
    useAi: body.useAi !== false,
  })

  const col = await ebooksCol()
  const clash = await col.findOne({ slug: ebook.slug })
  if (clash) ebook.slug = `${ebook.slug}-${Date.now().toString(36)}`

  await col.insertOne(ebook)
  return NextResponse.json({ ok: true, usedAi, item: { ...publicShape(ebook), pages: ebook.pages } })
}

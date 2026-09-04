import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser, requireSuperAdmin } from '@/lib/route-auth'
import { ebooksCol, type EbookDoc, type EbookPage } from '@/lib/db/ebooks'
import { ensureEbookSeed } from '@/lib/ebooks-seed'
import { generateEbookDraft } from '@/lib/ebooks-generate'
import { buildEbookCoverPrompt, generateCoverImage } from '@/lib/ai-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

/** Generate a topic-relevant illustration for a page */
async function generatePageIllustration(page: EbookPage, topic: string): Promise<string | null> {
  const pageType = page.type || 'section'
  const pageTitle = page.title || topic

  // Build a topic-specific prompt based on page type
  const prompts: Record<string, string> = {
    section: `Professional photograph representing "${pageTitle}" in the context of ${topic}, modern tech aesthetic, clean composition, dramatic lighting, no text`,
    infographic: `Data visualization infographic style image for "${pageTitle}", charts and graphs, modern tech colors, clean design, no text`,
    code: `Developer workspace with code on screen, terminal, modern IDE, dark theme, neon accents, no text`,
    quiz: `Interactive quiz concept, question marks, lightbulb moments, modern educational design, no text`,
    timeline: `Historical timeline visualization, milestones, progress, modern design, no text`,
    callout: `Warning or tip concept, shield or lightbulb, professional tech style, no text`,
    journey: `Journey roadmap visualization, steps, progress path, modern design, no text`,
    tips: `Best practices concept, checklist, professional tips, clean design, no text`,
    compare: `Comparison visualization, before/after, side by side, modern design, no text`,
    stats: `Statistics and numbers visualization, data charts, modern tech style, no text`,
    cover: `Book cover illustration for "${pageTitle}", professional design, vibrant colors, no text`,
  }

  const prompt = prompts[pageType] || prompts.section

  try {
    const art = await generateCoverImage(prompt, { width: 800, height: 450 })
    return art
  } catch {
    return null
  }
}

function publicShape(e: EbookDoc) {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    subtitle: e.subtitle,
    description: e.description,
    topic: e.topic,
    coverTheme: e.coverTheme,
    coverImageUrl: e.coverImageUrl,
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

  const col = await ebooksCol()
  const hasAny = await col.findOne({}, { projection: { _id: 1 } })
  if (!hasAny) {
    await ensureEbookSeed('system')
  }
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

  // Eye-catching 3D cover art — best effort, CSS cover remains the fallback.
  try {
    const art = await generateCoverImage(
      buildEbookCoverPrompt({ topic: ebook.topic, title: ebook.title }),
      { width: 768, height: 1024 },
    )
    if (art) ebook.coverImageUrl = art
  } catch {
    /* keep gradient cover */
  }

  // Generate per-chapter illustrations for section and infographic pages
  if (ebook.pages && ebook.pages.length > 0) {
    const pagesWithIllustrations = await Promise.all(
      ebook.pages.map(async (page, idx) => {
        if (['section', 'infographic', 'journey', 'compare', 'stats'].includes(page.type) && !page.imageUrl) {
          try {
            const illustration = await generatePageIllustration(page, ebook.topic)
            if (illustration) {
              return { ...page, imageUrl: illustration }
            }
          } catch {
            /* keep page without illustration */
          }
        }
        return page
      })
    )
    ebook.pages = pagesWithIllustrations
  }

  await col.insertOne(ebook)
  return NextResponse.json({ ok: true, usedAi, item: { ...publicShape(ebook), pages: ebook.pages } })
}

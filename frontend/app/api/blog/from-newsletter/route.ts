/**
 * Publish a completed/sent newsletter campaign as a Newsroom blog post.
 * POST /api/blog/from-newsletter  { campaignId, publish?: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import { teamPublicPaths } from '@/lib/learn/team-queries'
import { getAPIUser, requireSuperAdmin } from '@/lib/route-auth'
import { emailCampaigns } from '@/lib/db/email-campaigns'
import { revalidateContent } from '@/lib/cache/revalidate'
import {
  blogPosts,
  estimateReadMinutes,
  newBlogId,
  nowIso,
  slugifyTitle,
  type BlogPostDoc,
} from '@/lib/db/blog-posts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const body = (await req.json().catch(() => ({}))) as { campaignId?: string; publish?: boolean }
    const campaignId = String(body.campaignId || '').trim()
    if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 })

    const campaigns = await emailCampaigns()
    const campaign = await campaigns.findOne({
      $or: [{ id: campaignId }, { campaign_id: campaignId }],
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const posts = await blogPosts()
    const existing = await posts.findOne({ newsletter_campaign_id: campaign.id })
    if (existing) {
      return NextResponse.json({
        ok: true,
        already: true,
        post: existing,
        url: (await teamPublicPaths([existing]).catch(() => new Map<string, string>())).get(existing.slug) || `/learn/${existing.slug}`,
        message: 'Already published to Learn',
      })
    }

    const title = String(campaign.subject || 'Newsletter update').trim()
    let slug = slugifyTitle(title)
    if (await posts.findOne({ slug })) slug = `${slug}-${Date.now().toString(36)}`

    const html = String(campaign.body || '')
    const excerpt =
      String(campaign.intro || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400) || title

    const publish = body.publish !== false
    const now = nowIso()
    const user = await getAPIUser()

    const doc: BlogPostDoc = {
      id: newBlogId(),
      slug,
      title,
      excerpt,
      body: html || `<p>${excerpt}</p>`,
      cover_image: campaign.hero_image || undefined,
      category: 'product',
      tags: ['newsletter'],
      author_name: 'CodeSpectra Team',
      author_role: 'Product',
      status: publish ? 'published' : 'draft',
      source_note: 'Published from newsletter campaign',
      newsletter_campaign_id: campaign.id,
      read_minutes: estimateReadMinutes(html),
      published_at: publish ? now : null,
      created_at: now,
      updated_at: now,
      created_by: user?.id || 'admin',
    }

    await posts.insertOne(doc)
    if (publish) await revalidateContent('news', doc.slug)
    return NextResponse.json({
      ok: true,
      post: doc,
      url: (await teamPublicPaths([doc]).catch(() => new Map<string, string>())).get(doc.slug) || `/learn/${doc.slug}`,
      message: publish ? 'Published to Learn' : 'Saved as a draft',
    })
  } catch (e) {
    console.error('[blog] from-newsletter:', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

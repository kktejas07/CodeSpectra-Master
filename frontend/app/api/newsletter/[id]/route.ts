/**
 * GET /api/newsletter/[id] — published campaign body for in-app reader / modal.
 * id = internal `id` or public `campaign_id`. Use `latest` for most recent completed.
 */
import { NextResponse } from 'next/server'
import DOMPurify from 'isomorphic-dompurify'
import { emailCampaigns } from '@/lib/db/email-campaigns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  try {
    const col = await emailCampaigns()
    // ponytail: as const so $in matches EmailCampaignDoc.status (not string[])
    const publishedStatuses = ['completed', 'sending'] as const

    const campaign =
      id === 'latest'
        ? await col.findOne(
            { status: { $in: publishedStatuses } },
            { sort: { completed_at: -1, created_at: -1 } },
          )
        : await col.findOne({
            $or: [{ id }, { campaign_id: id }],
            status: { $in: publishedStatuses },
          })

    if (!campaign) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })

    return NextResponse.json({
      id: campaign.id,
      campaign_id: campaign.campaign_id,
      subject: campaign.subject,
      intro: campaign.intro || '',
      body: DOMPurify.sanitize(campaign.body || ''),
      hero_image: campaign.hero_image || '',
      cta_text: campaign.cta_text || '',
      cta_url: campaign.cta_url || '',
      completed_at: campaign.completed_at || campaign.created_at,
    })
  } catch (e) {
    console.error('[newsletter] public get error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

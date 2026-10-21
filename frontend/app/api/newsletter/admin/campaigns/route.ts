/**
 * GET  /api/newsletter/admin/campaigns — list all campaigns with stats.
 * POST /api/newsletter/admin/campaigns — create campaign (draft or send immediately).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { emailCampaigns, newCampaignId, newId, nowIso, type EmailCampaignDoc } from '@/lib/db/email-campaigns'
import { newsletterSubscribers } from '@/lib/db/newsletter'
import { getMongoDb } from '@/lib/mongodb'
import { executeCampaign } from '@/lib/newsletter-execute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const col = await emailCampaigns()
    const campaigns = await col.find({}).sort({ created_at: -1 }).limit(50).toArray()

    const stats = await col.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalCampaigns: { $sum: 1 },
          totalEmailsSent: { $sum: '$email_ok' },
          totalEmailsFailed: { $sum: '$email_fail' },
          totalPushSent: { $sum: '$push_ok' },
          totalInAppSent: { $sum: '$in_app_ok' },
          totalWhatsAppSent: { $sum: { $ifNull: ['$whatsapp_ok', 0] } },
        }
      }
    ]).toArray()

    return NextResponse.json({ campaigns, stats: stats[0] || { totalCampaigns: 0, totalEmailsSent: 0, totalEmailsFailed: 0, totalPushSent: 0, totalInAppSent: 0, totalWhatsAppSent: 0 } })
  } catch (e) {
    console.error('[newsletter] list campaigns error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const body = await req.json().catch(() => ({})) as {
    subject?: string
    hero_image?: string
    intro?: string
    body?: string
    cta_text?: string
    cta_url?: string
    include_upcoming?: boolean
    channels?: { email?: boolean; push?: boolean; in_app?: boolean; whatsapp?: boolean }
    send_at?: string
    preview_only?: boolean
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  if (!subject) {
    return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  }

  const channels = {
    email: body.channels?.email !== false,
    push: body.channels?.push !== false,
    in_app: body.channels?.in_app !== false,
    whatsapp: body.channels?.whatsapp === true,
  }

  if (!channels.email && !channels.push && !channels.in_app && !channels.whatsapp) {
    return NextResponse.json({ error: 'At least one channel must be enabled' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const subsCol = await newsletterSubscribers()
    const subsCount = await subsCol.countDocuments({ status: 'subscribed' })

    const campaign: EmailCampaignDoc = {
      id: newId(),
      campaign_id: newCampaignId(),
      subject,
      hero_image: body.hero_image || '',
      intro: body.intro || '',
      body: body.body || '',
      cta_text: body.cta_text || '',
      cta_url: body.cta_url || '',
      include_upcoming: body.include_upcoming !== false,
      channels,
      recipients_count: subsCount,
      status: 'draft',
      send_at: body.send_at || null,
      email_ok: 0,
      email_fail: 0,
      push_ok: 0,
      push_fail: 0,
      in_app_ok: 0,
      whatsapp_ok: 0,
      whatsapp_fail: 0,
      created_at: nowIso(),
      completed_at: null,
      created_by: gate.user.email || gate.user.id,
    }

    if (body.preview_only) {
      // "Save Draft" — persist with status 'draft' (never scheduled/sent).
      const col = await emailCampaigns()
      await col.insertOne({ ...campaign, status: 'draft', send_at: null })
      return NextResponse.json({ ok: true, campaign_id: campaign.campaign_id, recipients_count: subsCount, status: 'draft' })
    }

    // If send_at is in the future, schedule it
    if (body.send_at && new Date(body.send_at) > new Date()) {
      campaign.status = 'scheduled'
      const col = await emailCampaigns()
      await col.insertOne(campaign)
      return NextResponse.json({ ok: true, campaign_id: campaign.campaign_id, status: 'scheduled' })
    }

    // Send immediately
    campaign.status = 'sending'
    const col = await emailCampaigns()
    await col.insertOne(campaign)

    // Execute campaign with proper error handling
    executeCampaign(campaign).catch(e => {
      console.error('[newsletter] campaign execution error:', e)
      // Update campaign status to failed on error
      col.updateOne(
        { id: campaign.id },
        { $set: { status: 'failed', completed_at: nowIso() } }
      ).catch(dbErr => console.error('[newsletter] failed to update campaign status:', dbErr))
    })

    return NextResponse.json({ ok: true, campaign_id: campaign.campaign_id, recipients_count: subsCount, status: 'sending' })
  } catch (e) {
    console.error('[newsletter] create campaign error:', e)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}

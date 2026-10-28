/**
 * GET    /api/newsletter/admin/campaigns/[id] — get single campaign.
 * PATCH  /api/newsletter/admin/campaigns/[id] — update/reschedule campaign.
 * DELETE /api/newsletter/admin/campaigns/[id] — cancel/delete campaign.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { emailCampaigns, nowIso, type EmailCampaignDoc } from '@/lib/db/email-campaigns'
import { executeCampaign } from '@/lib/newsletter-execute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await ctx.params
  try {
    const col = await emailCampaigns()
    const campaign = await col.findOne({ id })
    if (!campaign) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
    return NextResponse.json({ campaign })
  } catch (e) {
    console.error('[newsletter] get campaign error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  try {
    const col = await emailCampaigns()
    const existing = await col.findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })

    // Only allow editing draft or scheduled campaigns
    if (existing.status !== 'draft' && existing.status !== 'scheduled') {
      return NextResponse.json({ error: 'Can only edit draft or scheduled campaigns' }, { status: 400 })
    }

    const allowedFields = ['subject', 'hero_image', 'intro', 'body', 'cta_text', 'cta_url', 'include_upcoming', 'channels', 'send_at', 'status', 'recipients_count']
    const updates: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (key in body) updates[key] = body[key]
    }

    // Resumed-draft flow: a scheduled send_at flips status to 'scheduled';
    // a send flag (/body.send === true) persists and executes immediately.
    if (typeof updates.send_at === 'string' && updates.send_at && new Date(updates.send_at) > new Date()) {
      updates.status = 'scheduled'
    } else if (body.send === true) {
      updates.status = 'sending'
      updates.send_at = null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const sendsNow = updates.status === 'sending'
    await col.updateOne({ id }, { $set: updates })
    const updated = await col.findOne({ id })

    if (sendsNow) {
      executeCampaign(updated as EmailCampaignDoc).catch((e: Error) => {
        console.error('[newsletter] resumed-campaign execution error:', e)
        col.updateOne({ id }, { $set: { status: 'failed', completed_at: nowIso() } }).catch(() => {})
      })
    }

    return NextResponse.json({ ok: true, campaign: updated })
  } catch (e) {
    console.error('[newsletter] update campaign error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await ctx.params
  try {
    const col = await emailCampaigns()
    const existing = await col.findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })

    // Can't delete a sending campaign
    if (existing.status === 'sending') {
      return NextResponse.json({ error: 'Cannot delete a campaign that is currently sending' }, { status: 400 })
    }

    await col.deleteOne({ id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[newsletter] delete campaign error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}

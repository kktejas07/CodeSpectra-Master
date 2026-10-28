/**
 * Admin → Social studio → one queued item (superadmin).
 *  GET                                             the item with its caption drafts and post marks
 *  POST { action: 'draft', lang, ai }              (re)write every platform's caption in `lang`
 *                                                  (ai=false: template from the item's facts only)
 *       { action: 'save', lang, platform, text }   keep an edited caption
 *       { action: 'posted', platform, posted }     mark / unmark as posted (who + when)
 * Rate limited; AI drafts also count against the studio's daily and monthly caps.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { limitRequest } from '@/lib/rate-limit'
import { getQueueItem, saveCaptions, setPosted } from '@/lib/social/store'
import { CAPTION_LANGS, SOCIAL_PLATFORMS, type CaptionDraft, type SocialPlatform } from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  try {
    const item = await getQueueItem(id)
    if (!item) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    return NextResponse.json({ item })
  } catch (e) {
    console.error('[social] item GET:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('draft'), lang: z.enum(CAPTION_LANGS), ai: z.boolean().default(true) }),
  z.object({ action: z.literal('save'), lang: z.enum(CAPTION_LANGS), platform: z.enum(SOCIAL_PLATFORMS), text: z.string().max(5000) }),
  z.object({ action: z.literal('posted'), platform: z.enum(SOCIAL_PLATFORMS), posted: z.boolean() }),
])

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'admin-social', gate.user.id, 60, 60_000)
  if (limited) return limited
  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const b = parsed.data
  try {
    const item = await getQueueItem(id)
    if (!item) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    const by = { id: gate.user.id, name: gate.user.fullName || gate.user.name || gate.user.email }
    const ts = new Date().toISOString()

    if (b.action === 'draft') {
      const { draftCaptions } = await import('@/lib/social/ai')
      const r = await draftCaptions(item, b.lang, gate.user.id, { useAi: b.ai })
      const drafts: Partial<Record<SocialPlatform, CaptionDraft>> = {}
      for (const p of SOCIAL_PLATFORMS) drafts[p] = { text: r.captions[p].text, ai: r.captions[p].ai, edited: false, updated_at: ts, updated_by: gate.user.id }
      return NextResponse.json({ item: await saveCaptions(id, b.lang, drafts), fallback: r.fallback })
    }
    if (b.action === 'save') {
      const prev = item.captions?.[b.lang]?.[b.platform]
      const text = b.text.replace(/\r\n/g, '\n').trim()
      return NextResponse.json({ item: await saveCaptions(id, b.lang, { [b.platform]: { text, ai: prev?.ai ?? false, edited: true, updated_at: ts, updated_by: gate.user.id } }) })
    }
    return NextResponse.json({ item: await setPosted(id, b.platform, b.posted, by) })
  } catch (e) {
    console.error('[social] item POST:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}

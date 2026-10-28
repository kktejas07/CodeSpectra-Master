/**
 * Admin → Social studio (superadmin).
 *  GET  ?type&status=all|not_posted|posted&platform&q&from&to&page  → queue page, AI status, settings
 *  POST { action: 'sync' }                       queue anything published in the last 14 days (idempotent)
 *       { action: 'settings', patch }            AI switch and caps
 *       { action: 'roundup', ids: string[] }     create / refresh this week's roundup item → { id }
 * Nothing here posts to a social network.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { auditAdmin } from '@/lib/admin-audit'
import { getAppOrigin } from '@/lib/app-origin'
import { QueueFilterSchema, queueKey, queueMongoFilter, roundupInput } from '@/lib/social/queue'
import { SocialSettingsPatchSchema } from '@/lib/social/settings'
import { getSocialSettings, queueCol, saveSocialSettings, socialId, upsertQueueItems } from '@/lib/social/store'
import type { SocialQueueDoc } from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const PAGE = 24
const LIST_PROJECTION = { _id: 0, captions: 0 } as const

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const sp = Object.fromEntries(new URL(req.url).searchParams)
  const f = QueueFilterSchema.safeParse(Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== '')))
  if (!f.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  try {
    const c = await queueCol()
    const filter = queueMongoFilter(f.data)
    const sort: Record<string, -1> = f.data.status === 'posted' ? { last_posted_at: -1, published_at: -1 } : { published_at: -1 }
    const [items, total, { settings, draftsToday }] = await Promise.all([
      c.find(filter, { projection: LIST_PROJECTION }).sort(sort).skip((f.data.page - 1) * PAGE).limit(PAGE).toArray(),
      c.countDocuments(filter),
      getSocialSettings(),
    ])
    const { aiStatus } = await import('@/lib/social/ai')
    return NextResponse.json({ items, total, page: f.data.page, pages: Math.max(1, Math.ceil(total / PAGE)), settings, ai: await aiStatus().catch(() => ({ draftsToday })) })
  } catch (e) {
    console.error('[social] GET:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync') }),
  z.object({ action: z.literal('settings'), patch: SocialSettingsPatchSchema }),
  z.object({ action: z.literal('roundup'), ids: z.array(z.string().regex(/^sq_[a-f0-9]{16}$/)).min(1).max(10) }),
])

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const b = parsed.data
  try {
    if (b.action === 'sync') {
      const { syncSocialQueue } = await import('@/lib/social/sync')
      return NextResponse.json({ ok: true, ...(await syncSocialQueue(new Date())) })
    }
    if (b.action === 'settings') {
      const settings = await saveSocialSettings(b.patch, gate.user.id)
      await auditAdmin(gate.user, 'social.settings', 'social_settings', 'default', JSON.stringify(b.patch).slice(0, 300)).catch(() => undefined)
      return NextResponse.json({ ok: true, settings })
    }
    // Roundup: keep the picked order; only queued, non-roundup items.
    const rows = (await (await queueCol()).find({ id: { $in: b.ids }, type: { $ne: 'roundup' } }, { projection: { _id: 0, id: 1, title: 1, type: 1, url: 1 } }).toArray()) as Pick<SocialQueueDoc, 'id' | 'title' | 'type' | 'url'>[]
    const ordered = b.ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r)
    if (!ordered.length) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    const input = roundupInput(ordered, getAppOrigin(), new Date())
    await upsertQueueItems([input])
    return NextResponse.json({ ok: true, id: socialId(queueKey(input.type, input.ref_id)) })
  } catch (e) {
    console.error('[social] POST:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}

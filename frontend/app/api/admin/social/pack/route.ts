/**
 * Admin → Social studio → Today's pack (superadmin).
 *  GET  ?day=YYYY-MM-DD (default: today, India date)   the pack + the loop's switch
 *  POST { action: 'build' }                            build / refresh today's pack now (the social pack loop)
 *       { action: 'approve', day }                     record the owner's sign-off
 * Nothing here posts to a social network: the owner posts with the share buttons.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { auditAdmin } from '@/lib/admin-audit'
import { limitRequest } from '@/lib/rate-limit'
import { packDay } from '@/lib/agent-loops/pure/social-pack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const raw = new URL(req.url).searchParams.get('day')
  const day = raw ? Day.safeParse(raw) : { success: true as const, data: packDay(new Date()) }
  if (!day.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  try {
    const [{ getPack }, { getLoopSettings }] = await Promise.all([import('@/lib/social/pack'), import('@/lib/agent-loops/store')])
    const [pack, { settings }] = await Promise.all([getPack(day.data), getLoopSettings('social-pack')])
    return NextResponse.json({ day: day.data, pack, loop: { enabled: settings.enabled, run_hour_utc: settings.run_hour_utc, langs: settings.langs, use_ai: settings.use_ai } })
  } catch (e) {
    console.error('[social] pack GET:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('build') }),
  z.object({ action: z.literal('approve'), day: Day }),
])

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'admin-social-pack', gate.user.id, 10, 60_000)
  if (limited) return limited
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  try {
    if (parsed.data.action === 'build') {
      const { runAgentLoopNow } = await import('@/lib/agent-loops/runner')
      const r = await runAgentLoopNow('social-pack', gate.user.id)
      if (!r.ok) {
        const inUse = r.reason !== 'failed'
        return NextResponse.json(apiErrorFor(inUse ? 'rate_limited_shortly' : 'failed'), { status: inUse ? 409 : 500 })
      }
      const { getPack } = await import('@/lib/social/pack')
      return NextResponse.json({ ok: true, pack: await getPack(packDay(new Date())), notes: r.run.notes })
    }
    const { approvePack } = await import('@/lib/social/pack')
    const pack = await approvePack(parsed.data.day, gate.user.id)
    if (!pack) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    await auditAdmin(gate.user, 'social.pack_approve', 'social_pack', pack.id, `${pack.items.length} items`).catch(() => undefined)
    return NextResponse.json({ ok: true, pack })
  } catch (e) {
    console.error('[social] pack POST:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}

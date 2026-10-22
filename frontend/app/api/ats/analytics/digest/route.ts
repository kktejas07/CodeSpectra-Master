/**
 * Weekly analytics digest settings for the organisation.
 * GET   — { enabled, me_opted_out, can_manage }
 * PATCH { enabled } — hiring admins turn the Monday digest on / off for the organisation.
 * PATCH { opted_out } — anyone who gets it opts themselves out / back in.
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { bodyOf, gate, json } from '@/lib/ats/http'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await gate(req, 'analytics.view')
  if ('res' in g) return g.res
  try {
    const { getDigestSettings } = await import('@/lib/ats/hiring-insights-server')
    const s = await getDigestSettings(g.actor.tenantId)
    return json({ enabled: s.enabled, me_opted_out: (s.opted_out || []).includes(g.actor.userId), can_manage: g.actor.role === 'admin' })
  } catch (e) {
    console.error('[ats digest] GET:', (e as Error)?.message)
    return json({ error: 'Something went wrong. Try again.' }, 500)
  }
}

const Body = z.union([z.object({ enabled: z.boolean() }).strict(), z.object({ opted_out: z.boolean() }).strict()])

export async function PATCH(req: NextRequest) {
  const g = await gate(req, 'analytics.view')
  if ('res' in g) return g.res
  const b = Body.safeParse(await bodyOf(req))
  if (!b.success) return json({ error: 'Invalid request', code: 'invalid_request' }, 400)
  try {
    const { setDigestEnabled, setDigestOptOut } = await import('@/lib/ats/hiring-insights-server')
    if ('enabled' in b.data) {
      if (g.actor.role !== 'admin') return json({ error: "Your hiring role can't do this" }, 403)
      await setDigestEnabled(g.actor, b.data.enabled)
    } else {
      await setDigestOptOut(g.actor.tenantId, g.actor.userId, b.data.opted_out)
    }
    return json({ ok: true })
  } catch (e) {
    console.error('[ats digest] PATCH:', (e as Error)?.message)
    return json({ error: 'Something went wrong. Try again.' }, 500)
  }
}

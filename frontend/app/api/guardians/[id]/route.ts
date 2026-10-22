/**
 * One guardian of the signed-in learner.
 * PATCH { share?, channels? } → what is shared / which channels (only narrowing the guardian's choice)
 * DELETE → revoke (no more reports; the guardian's link stops working)
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import type { IdRouteContext } from '@/lib/app-route-context'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorBody } from '@/lib/api-errors'
import { SHARE_KEYS } from '@/lib/guardian/summary'
import { guardianFail, json } from '@/lib/guardian/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PatchSchema = z.object({
  share: z.object(Object.fromEntries(SHARE_KEYS.map((k) => [k, z.boolean().optional()]))).strict().optional(),
  channels: z.object({ email: z.boolean().optional(), whatsapp: z.boolean().optional() }).strict().optional(),
}).strict()

const ID = /^[A-Za-z0-9_-]{6,40}$/

export async function PATCH(req: NextRequest, { params }: IdRouteContext) {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error, code: 'unauthorized' }, a.status)
  const limited = await limitRequest(req, 'guardian-update', a.user.id, 60, 60 * 60_000)
  if (limited) return limited
  const { id } = await params
  if (!ID.test(id)) return json(apiErrorBody('Not found', 'not_found'), 404)
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json(apiErrorBody('Invalid request', 'invalid_request'), 400)
  try {
    const svc = await import('@/lib/guardian/service')
    return json({ guardian: svc.guardianView(await svc.updateGuardian(a.user.id, id, parsed.data)) })
  } catch (e) {
    return guardianFail(e, 'update')
  }
}

export async function DELETE(req: NextRequest, { params }: IdRouteContext) {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error, code: 'unauthorized' }, a.status)
  const limited = await limitRequest(req, 'guardian-update', a.user.id, 60, 60 * 60_000)
  if (limited) return limited
  const { id } = await params
  if (!ID.test(id)) return json(apiErrorBody('Not found', 'not_found'), 404)
  try {
    const svc = await import('@/lib/guardian/service')
    await svc.revokeGuardian(a.user.id, id)
    return json({ ok: true })
  } catch (e) {
    return guardianFail(e, 'revoke')
  }
}

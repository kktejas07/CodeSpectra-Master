/**
 * Guardian invite (public, token from the invite email / WhatsApp).
 * GET ?token= → { invite } (learner first name, what is shared, whether verification is needed)
 * POST { token, decision: 'accept' | 'decline', code?, attest?, email?, whatsapp? }
 * Rate limited per IP; wrong codes are counted on the invite (locked after 5).
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorBody } from '@/lib/api-errors'
import { guardianFail, json } from '@/lib/guardian/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/

const AcceptSchema = z.object({
  token: z.string().regex(TOKEN),
  decision: z.enum(['accept', 'decline']),
  code: z.string().regex(/^\d{6}$/).optional(),
  attest: z.boolean().optional(),
  email: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
}).strict()

export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, 'guardian-accept-read', null, 30, 10 * 60_000)
  if (limited) return limited
  const token = new URL(req.url).searchParams.get('token') || ''
  if (!TOKEN.test(token)) return json(apiErrorBody('This invite link is not valid any more.', 'guardian_invite_invalid'), 404)
  try {
    const { invitePreview } = await import('@/lib/guardian/service')
    const invite = await invitePreview(token)
    if (!invite) return json(apiErrorBody('This invite link is not valid any more.', 'guardian_invite_invalid'), 404)
    return json({ invite })
  } catch (e) {
    return guardianFail(e, 'invite read')
  }
}

export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, 'guardian-accept', null, 10, 10 * 60_000)
  if (limited) return limited
  const parsed = AcceptSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json(apiErrorBody('Invalid request', 'invalid_request'), 400)
  try {
    const { acceptInvite } = await import('@/lib/guardian/service')
    return json({ status: await acceptInvite(parsed.data) })
  } catch (e) {
    return guardianFail(e, 'accept')
  }
}

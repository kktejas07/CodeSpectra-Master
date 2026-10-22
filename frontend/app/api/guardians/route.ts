/**
 * The signed-in learner's guardians (lib/guardian).
 * GET  → { guardians, minor, max, consent_text }
 * POST { name, email?, phone?, phone_country?, relation, locale, share?, declared_minor?, timezone?, consent: true } → invite
 */
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorBody } from '@/lib/api-errors'
import { isValidTimezone } from '@/lib/subscriptions/filters'
import { LOCALES } from '@/lib/i18n/config'
import { RELATIONS, SHARE_KEYS, MAX_GUARDIANS } from '@/lib/guardian/summary'
import { guardianFail, json } from '@/lib/guardian/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ShareSchema = z.object(Object.fromEntries(SHARE_KEYS.map((k) => [k, z.boolean().optional()]))).strict()

const InviteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().max(254).email().optional().or(z.literal('')),
  phone: z.string().trim().max(24).optional().or(z.literal('')),
  phone_country: z.string().regex(/^[A-Z]{2}$/).optional(),
  relation: z.enum(RELATIONS),
  locale: z.enum(LOCALES),
  share: ShareSchema.optional(),
  declared_minor: z.boolean().optional(),
  timezone: z.string().max(64).refine(isValidTimezone).optional(),
  consent: z.literal(true),
}).strict()

export async function GET() {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error, code: 'unauthorized' }, a.status)
  try {
    const svc = await import('@/lib/guardian/service')
    const [rows, minor] = await Promise.all([svc.listGuardians(a.user.id), svc.learnerIsMinor(a.user.id)])
    return json({ guardians: rows.map(svc.guardianView), minor, max: MAX_GUARDIANS, consent_text: svc.LEARNER_CONSENT_TEXT })
  } catch (e) {
    return guardianFail(e, 'list')
  }
}

export async function POST(req: NextRequest) {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error, code: 'unauthorized' }, a.status)
  const limited = await limitRequest(req, 'guardian-invite', a.user.id, 6, 60 * 60_000)
  if (limited) return limited
  const parsed = InviteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const consent = parsed.error.issues.some((i) => i.path[0] === 'consent')
    return json(apiErrorBody(consent ? 'Confirm that you want to share your progress.' : 'Invalid request', consent ? 'guardian_consent_required' : 'invalid_request'), 400)
  }
  try {
    const svc = await import('@/lib/guardian/service')
    const { link } = await svc.inviteGuardian(a.user.id, { ...parsed.data, email: parsed.data.email || null, phone: parsed.data.phone || null })
    return json({ guardian: svc.guardianView(link) }, 201)
  } catch (e) {
    return guardianFail(e, 'invite')
  }
}

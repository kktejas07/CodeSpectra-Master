/**
 * WhatsApp practice for the signed-in learner (lib/wa-practice).
 * GET    → { enrollment, domains, settings: { max_daily_cap, quiet_start_hour, quiet_end_hour }, consent_text }
 * POST   { phone, phone_country?, domain, level, locale, send_hour, timezone, daily_cap?, consent: true } → enroll / update (sends the opt-in)
 * PATCH  { action: 'resend' | 'stop' | 'resume' }
 * DELETE → turn off and delete the number + practice history
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorBody, englishApiError, isApiErrorCode } from '@/lib/api-errors'
import { isValidTimezone } from '@/lib/subscriptions/filters'
import { LOCALES } from '@/lib/i18n/config'
import { PRACTICE_LEVELS } from '@/lib/wa-practice/logic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

async function fail(e: unknown, where: string) {
  const { PracticeError } = await import('@/lib/wa-practice/service')
  if (e instanceof PracticeError) {
    const code = isApiErrorCode(e.code) ? e.code : null
    return json(apiErrorBody(code ? englishApiError(code, e.params) : e.code, e.code, e.params ?? null), e.status)
  }
  console.error(`[wa-practice] ${where} failed:`, (e as Error)?.message)
  return json(apiErrorBody('Something went wrong. Please try again.', 'server_error'), 500)
}

const EnrollSchema = z.object({
  phone: z.string().trim().min(6).max(24),
  phone_country: z.string().regex(/^[A-Z]{2}$/).optional(),
  domain: z.string().regex(/^[a-z0-9_]{1,40}$/),
  level: z.enum(PRACTICE_LEVELS),
  locale: z.enum(LOCALES),
  send_hour: z.coerce.number().int().min(0).max(23),
  timezone: z.string().max(64).refine(isValidTimezone, 'Invalid time zone'),
  daily_cap: z.coerce.number().int().min(1).max(20).optional(),
  consent: z.literal(true),
}).strict()

const ActionSchema = z.object({ action: z.enum(['resend', 'stop', 'resume']) }).strict()

export async function GET() {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error, code: 'unauthorized' }, a.status)
  try {
    const svc = await import('@/lib/wa-practice/service')
    const { getPracticeSettings } = await import('@/lib/wa-practice/store')
    const { listDomains } = await import('@/lib/question-bot/store')
    const [e, s, domains] = await Promise.all([svc.getEnrollment(a.user.id), getPracticeSettings(), listDomains({ activeOnly: true })])
    return json({
      enrollment: svc.enrollmentView(e),
      domains: domains.map((d) => ({ id: d.id, label: d.label })),
      settings: { enabled: s.enabled, max_daily_cap: s.max_daily_cap, default_daily_cap: s.default_daily_cap, quiet_start_hour: s.quiet_start_hour, quiet_end_hour: s.quiet_end_hour, mock_weekday: s.mock_weekday, mock_size: s.mock_size },
      consent_text: svc.PRACTICE_CONSENT_TEXT,
    })
  } catch (e) {
    return fail(e, 'read')
  }
}

export async function POST(req: NextRequest) {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error, code: 'unauthorized' }, a.status)
  const limited = await limitRequest(req, 'wa-practice-enroll', a.user.id, 10, 60 * 60_000)
  if (limited) return limited
  const parsed = EnrollSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === 'consent')
    return json(apiErrorBody(consentMissing ? 'Tick the consent box to continue.' : 'Invalid request', consentMissing ? 'wa_practice_consent_required' : 'invalid_request'), 400)
  }
  try {
    const svc = await import('@/lib/wa-practice/service')
    const e = await svc.enroll(a.user.id, parsed.data)
    return json({ enrollment: svc.enrollmentView(e) }, 201)
  } catch (e) {
    return fail(e, 'enroll')
  }
}

export async function PATCH(req: NextRequest) {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error, code: 'unauthorized' }, a.status)
  const limited = await limitRequest(req, 'wa-practice-action', a.user.id, 20, 60 * 60_000)
  if (limited) return limited
  const parsed = ActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json(apiErrorBody('Invalid request', 'invalid_request'), 400)
  try {
    const svc = await import('@/lib/wa-practice/service')
    if (parsed.data.action === 'resend') await svc.resendOptin(a.user.id)
    else if (parsed.data.action === 'stop') await svc.stopFromApp(a.user.id)
    else await svc.resumeFromApp(a.user.id)
    return json({ enrollment: svc.enrollmentView(await svc.getEnrollment(a.user.id)) })
  } catch (e) {
    return fail(e, parsed.data.action)
  }
}

export async function DELETE(req: NextRequest) {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error, code: 'unauthorized' }, a.status)
  const limited = await limitRequest(req, 'wa-practice-action', a.user.id, 20, 60 * 60_000)
  if (limited) return limited
  try {
    const svc = await import('@/lib/wa-practice/service')
    await svc.deleteEnrollment(a.user.id)
    return json({ ok: true })
  } catch (e) {
    return fail(e, 'delete')
  }
}

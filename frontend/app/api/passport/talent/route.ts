import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { countryFromHeaders } from '@/lib/analytics/privacy'
import { talentProfileSchema } from '@/lib/talent/core'
import { TalentError, talentProfileView, updateTalentProfile } from '@/lib/talent/db'
import { writeAuditLog } from '@/lib/db/misc'
import { apiErrorBody } from '@/lib/api-errors'

/**
 * PUT /api/passport/talent — opt in to recruiter discovery (explicit consent),
 * edit location / graduation year / availability, or withdraw at any time.
 */
export async function PUT(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const rl = await rateLimitRedis(`talent-profile:${user.id}`, 20, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many changes. Try again in a minute.', code: 'passport_too_many_changes' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  const parsed = talentProfileSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return NextResponse.json({ error: i ? `${i.path.join('.') || 'input'}: ${i.message}` : 'Invalid input' }, { status: 400 })
  }
  try {
    const hint = countryFromHeaders(req.headers)
    const before = parsed.data.discoverable
    const p = await updateTalentProfile(user.id, parsed.data, hint)
    await writeAuditLog({ action: before ? 'talent.discoverable_on' : 'talent.discoverable_off', outcome: 'success', actor: user.id, actorIp: '', resource: user.id, resourceType: 'skill_passport', severity: 'info', user_id: user.id })
    return NextResponse.json({ ok: true, talent: await talentProfileView(p, hint) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    if (e instanceof TalentError) return NextResponse.json(apiErrorBody(e.message, e.code, e.params), { status: e.status })
    console.error('[talent] profile PUT failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Couldn’t save. Try again.', code: 'save_failed' }, { status: 500 })
  }
}

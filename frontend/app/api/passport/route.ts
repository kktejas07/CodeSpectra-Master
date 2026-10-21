import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAPIUser } from '@/lib/route-auth'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { getSiteOrigin } from '@/lib/seo/settings'
import { countryFromHeaders } from '@/lib/analytics/privacy'
import { ownerPassport, updatePassportSettings, PassportError } from '@/lib/passport/db'
import { revalidatePassport } from '@/lib/cache/passport'
import { listLearnerInvites, talentProfileView } from '@/lib/talent/db'
import { consentCopy, consentRegime } from '@/lib/talent/core'
import { linkedInCertUrl } from '@/lib/passport/core'
import { apiErrorBody } from '@/lib/api-errors'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** GET /api/passport — the signed-in learner's passport, share settings, discovery state and invites. */
export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const rl = await rateLimitRedis(`passport-get:${user.id}`, 60, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests. Try again in a minute.', code: 'rate_limited_minute' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  try {
    const site = await getSiteOrigin()
    const o = await ownerPassport(user.id, site)
    const p = o.passport
    const countryHint = countryFromHeaders(req.headers)
    const talent = await talentProfileView(p, countryHint)
    const verifyUrl = `${site}/verify/${encodeURIComponent(o.credentialId)}`
    const shareUrl = p.visibility === 'link' ? `${site}/p/${p.handle}?k=${encodeURIComponent(p.link_key)}` : `${site}/p/${p.handle}`
    return NextResponse.json({
      passport: {
        handle: p.handle,
        name: p.display_name,
        visibility: p.visibility,
        hidden: p.hidden || [],
        shown: p.shown || [],
        show_self_reported: !!p.show_self_reported,
        issued_at: p.issued_at,
        credential_id: o.credentialId,
        share_url: p.visibility === 'private' ? null : shareUrl,
        verify_url: verifyUrl,
        linkedin_url: linkedInCertUrl({ name: 'CodeSpectra verified skill passport', verifyUrl, issuedAt: p.issued_at, credentialId: o.credentialId }),
      },
      summary: o.summary,
      evidence: o.evidence.map((e) => ({ id: e.id, kind: e.kind, title: e.title, score: Math.round(e.score), at: e.at, skills: e.skills, proctored: !!e.proctored, trust: e.trust ?? null, link: e.link ?? null, private_by_default: !!e.privateByDefault })),
      public_skills: o.publicSkills,
      talent,
      consent: consentCopy(talent.consented_at ? (talent.regime as ReturnType<typeof consentRegime>) : consentRegime(talent.country || countryHint)),
      invites: await listLearnerInvites(user.id),
    }, { headers: NO_STORE })
  } catch (e) {
    console.error('[passport] GET failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Your passport couldn’t be loaded. Try again.', code: 'passport_load_failed' }, { status: 500 })
  }
}

const idList = z.array(z.string().max(200).regex(/^[A-Za-z0-9_:.-]+$/)).max(500)
const patchSchema = z.object({
  visibility: z.enum(['private', 'link', 'public']).optional(),
  hidden: idList.optional(),
  shown: idList.optional(),
  show_self_reported: z.boolean().optional(),
  handle: z.string().trim().toLowerCase().max(30).optional(),
  rotate: z.boolean().optional(),
}).strict()

/** PATCH /api/passport — visibility, which evidence to show, handle, reset links. */
export async function PATCH(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const rl = await rateLimitRedis(`passport-patch:${user.id}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many changes. Try again in a minute.', code: 'passport_too_many_changes' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings', code: 'passport_invalid_settings' }, { status: 400 })
  try {
    const { before, after } = await updatePassportSettings(user.id, parsed.data)
    // Going private also hides the learner from talent search (search requires a shared passport).
    await revalidatePassport(before.handle, after.handle)
    return NextResponse.json({ ok: true, handle: after.handle, visibility: after.visibility }, { headers: NO_STORE })
  } catch (e) {
    if (e instanceof PassportError) return NextResponse.json(apiErrorBody(e.message), { status: e.status })
    console.error('[passport] PATCH failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Your settings couldn’t be saved. Try again.', code: 'passport_settings_save_failed' }, { status: 500 })
  }
}

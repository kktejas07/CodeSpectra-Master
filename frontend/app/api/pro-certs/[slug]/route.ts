/**
 * GET /api/pro-certs/[slug] — one certification for the signed-in learner:
 * eligibility to buy an attempt (cooldown, yearly limit, renewal window),
 * their attempts (with the personal start link while open) and credential,
 * plus the LinkedIn "add to profile" link once certified. Open attempts are
 * finalised on read once their test is fully graded.
 */
import { requireAuth } from '@/lib/route-auth'
import { errorJson, json } from '@/lib/pro-certs/http'
import { linkedInAddUrl } from '@/lib/pro-certs/pure'
import { getAppOrigin } from '@/lib/app-origin'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await requireAuth()
  if ('error' in g) return json({ error: g.error, code: 'unauthorized' }, g.status)
  const { slug } = await ctx.params
  try {
    const { myProgramState } = await import('@/lib/pro-certs/service')
    const st = await myProgramState(g.user.id, slug)
    if (!st) return json({ error: 'Certification not found.', code: 'pro_cert_not_found' }, 404)
    const c = st.credential
    const verifyUrl = c ? `${getAppOrigin()}/verify/${c.id}` : null
    return json({
      ...st,
      verify_url: verifyUrl,
      linkedin_url: c && verifyUrl && c.state === 'valid'
        ? linkedInAddUrl({ title: `${st.program.title} (CodeSpectra certified)`, issuedAt: c.issued_at, expiresAt: c.expires_at, credentialId: c.id, verifyUrl })
        : null,
    })
  } catch (e) {
    return errorJson(e, 'program GET')
  }
}

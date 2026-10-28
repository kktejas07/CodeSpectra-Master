/**
 * LTI 1.3 launch (form_post from the platform: id_token, state). Verifies the
 * token (platform JWKS, iss, aud/azp, exp, nonce, deployment, version, message
 * type), then 303 → the learner page or the teacher's deep-link picker.
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { FeatureError } from '@/lib/community/http'
import { communityT } from '@/lib/community/i18n-server'
import { htmlPage, requestLocale } from '@/lib/integrations/lti/html'
import { escapeHtml } from '@/lib/safe-html'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, 'lti-launch', null, 60, 60_000)
  if (limited) return limited
  const form = await req.formData().catch(() => null)
  try {
    const { oidcLaunch, STATE_COOKIE } = await import('@/lib/integrations/lti/service')
    const { getAppOrigin } = await import('@/lib/app-origin')
    const r = await oidcLaunch({ id_token: String(form?.get('id_token') || ''), state: String(form?.get('state') || '') }, req.cookies.get(STATE_COOKIE)?.value ?? null)
    const to = r.kind === 'deep_link' ? `${getAppOrigin()}/api/lti/deep-link/${r.token}` : `${getAppOrigin()}/lti/launch/${r.token}`
    const res = NextResponse.redirect(to, { status: 303 })
    res.cookies.set(STATE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'none', path: '/api/lti', maxAge: 0 })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (e) {
    const locale = requestLocale(req)
    const t = await communityT(locale)
    const code = e instanceof FeatureError ? e.code : 'server_error'
    if (!(e instanceof FeatureError)) console.error('[lti] launch failed', (e as Error)?.message)
    else if (e.code === 'lti_invalid_token') console.warn('[lti] launch rejected', e.params?.reason)
    return htmlPage({ locale, title: t('ltiErrorTitle'), status: e instanceof FeatureError ? e.status : 500, body: `<h1>${escapeHtml(t('ltiErrorTitle'))}</h1><p>${escapeHtml(t(`err_${code}`))}</p>` })
  }
}

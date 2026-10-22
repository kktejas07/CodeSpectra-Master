/**
 * LTI 1.3 OIDC login initiation (GET or form POST from the platform):
 * iss, login_hint, target_link_uri, lti_message_hint?, client_id?, lti_deployment_id?
 * → 302 to the platform's auth endpoint with a fresh single-use state + nonce.
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

async function handle(req: NextRequest, params: Record<string, string>) {
  const limited = await limitRequest(req, 'lti-login', null, 60, 60_000)
  if (limited) return limited
  try {
    const { oidcLogin, STATE_COOKIE } = await import('@/lib/integrations/lti/service')
    const r = await oidcLogin(params)
    const res = NextResponse.redirect(r.redirect, { status: 302 })
    // Bound to this browser when it allows third-party cookies (SameSite=None is needed for the cross-site form post).
    res.cookies.set(STATE_COOKIE, r.state, { httpOnly: true, secure: true, sameSite: 'none', path: '/api/lti', maxAge: 600 })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (e) {
    const locale = requestLocale(req)
    const t = await communityT(locale)
    const code = e instanceof FeatureError ? e.code : 'server_error'
    if (!(e instanceof FeatureError)) console.error('[lti] login failed', (e as Error)?.message)
    return htmlPage({ locale, title: t('ltiErrorTitle'), status: e instanceof FeatureError ? e.status : 500, body: `<h1>${escapeHtml(t('ltiErrorTitle'))}</h1><p>${escapeHtml(t(`err_${code}`))}</p>` })
  }
}

function pick(src: URLSearchParams | FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of ['iss', 'login_hint', 'target_link_uri', 'lti_message_hint', 'client_id', 'lti_deployment_id']) {
    const v = src.get(k)
    if (typeof v === 'string' && v.length <= 4000) out[k] = v
  }
  return out
}

export async function GET(req: NextRequest) {
  return handle(req, pick(new URL(req.url).searchParams))
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  return handle(req, form ? pick(form) : {})
}

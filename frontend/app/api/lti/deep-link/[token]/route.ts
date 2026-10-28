/**
 * LTI deep linking (teacher adds CodeSpectra tests to a course).
 * GET — picker (plain HTML: it renders inside the LMS dialog, framed only by that platform).
 * POST (form: exam_id[]) — signs the LtiDeepLinkingResponse and posts it back to the LMS.
 */
import type { NextRequest } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { FeatureError } from '@/lib/community/http'
import { communityT } from '@/lib/community/i18n-server'
import { htmlPage, originOf, requestLocale } from '@/lib/integrations/lti/html'
import { escapeHtml } from '@/lib/safe-html'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ token: string }> }

async function errorPage(req: NextRequest, e: unknown) {
  const locale = requestLocale(req)
  const t = await communityT(locale)
  const code = e instanceof FeatureError ? e.code : 'server_error'
  if (!(e instanceof FeatureError)) console.error('[lti] deep link failed', (e as Error)?.message)
  return htmlPage({ locale, title: t('ltiErrorTitle'), status: e instanceof FeatureError ? e.status : 500, body: `<h1>${escapeHtml(t('ltiErrorTitle'))}</h1><p>${escapeHtml(t(`err_${code}`))}</p>` })
}

async function platformOrigin(token: string) {
  const { getMongoDb } = await import('@/lib/mongodb')
  const db = await getMongoDb()
  const l = await db.collection('lti_launches').findOne({ token }, { projection: { _id: 0, platform_id: 1, 'claims.deep_link.return_url': 1 } })
  const p = l ? await db.collection('lti_platforms').findOne({ id: l.platform_id }, { projection: { _id: 0, issuer: 1 } }) : null
  return { frame: originOf(p?.issuer as string), form: originOf((l?.claims as { deep_link?: { return_url?: string } } | undefined)?.deep_link?.return_url) }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { token } = await params
  try {
    const { deepLinkSummary } = await import('@/lib/integrations/lti/service')
    const s = await deepLinkSummary(token)
    const locale = requestLocale(req)
    const t = await communityT(locale)
    const o = await platformOrigin(token)
    const type = s.multiple ? 'checkbox' : 'radio'
    const items = s.exams.length
      ? s.exams.map((e, i) => `<label><input type="${type}" name="exam_id" value="${escapeHtml(e.id)}"${i === 0 && !s.multiple ? ' required' : ''}><span>${escapeHtml(e.title)}</span></label>`).join('')
      : `<p>${escapeHtml(t('ltiNoTests'))}</p>`
    return htmlPage({
      locale, title: t('ltiPickTitle'), frameAncestor: o.frame,
      body: `<h1>${escapeHtml(t('ltiPickTitle'))}</h1><p>${escapeHtml(s.context ? t('ltiPickLeadCourse', { course: s.context }) : t('ltiPickLead'))}</p><form method="post">${items}${s.exams.length ? `<p><button type="submit">${escapeHtml(t('ltiAddToCourse'))}</button></p>` : ''}</form>`,
    })
  } catch (e) { return errorPage(req, e) }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const limited = await limitRequest(req, 'lti-deep-link', null, 30, 60_000)
  if (limited) return limited
  const { token } = await params
  try {
    const form = await req.formData().catch(() => null)
    const ids = (form?.getAll('exam_id') || []).map(String).filter((x) => /^[A-Za-z0-9_-]{1,128}$/.test(x)).slice(0, 20)
    const { deepLinkRespond } = await import('@/lib/integrations/lti/service')
    const o = await platformOrigin(token)
    const r = await deepLinkRespond(token, ids)
    const locale = requestLocale(req)
    const t = await communityT(locale)
    return htmlPage({
      locale, title: t('ltiReturning'), formOrigin: originOf(r.return_url), frameAncestor: o.frame,
      body: `<form id="f" method="post" action="${escapeHtml(r.return_url)}"><input type="hidden" name="JWT" value="${escapeHtml(r.jwt)}"><p>${escapeHtml(t('ltiReturning'))}</p><button type="submit">${escapeHtml(t('ltiReturnButton'))}</button></form>`,
      script: "document.getElementById('f').submit()",
    })
  } catch (e) { return errorPage(req, e) }
}

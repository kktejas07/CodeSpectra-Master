/** GET — the organisation's connected apps (no secrets): Slack, Teams, Google Classroom, LTI platforms + tool URLs, tests to link. */
import type { NextRequest } from 'next/server'
import { adminGate, errorResponse, json, tenantOf } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  const tenant = tenantOf(g.user)!
  try {
    const [{ listIntegrations, getSecret }, { maskSecret }, lti, classroom, { getMongoDb }] = await Promise.all([
      import('@/lib/integrations/store'), import('@/lib/integrations/chat'), import('@/lib/integrations/lti/service'), import('@/lib/integrations/classroom'), import('@/lib/mongodb'),
    ])
    const rows = await listIntegrations(tenant)
    const by = (p: string) => rows.find((r) => r.provider === p) ?? null
    const slack = await getSecret<{ webhook_url?: string; bot_token?: string }>(tenant, 'slack')
    const teams = await getSecret<{ webhook_url?: string }>(tenant, 'teams')
    const examFilter = tenant === 'platform' ? { $or: [{ tenant_id: null }, { tenant_id: { $exists: false } }, { tenant_id: 'platform' }] } : { tenant_id: tenant }
    const exams = await (await getMongoDb()).collection('exams').find(examFilter, { projection: { _id: 0, id: 1, title: 1 } }).sort({ created_at: -1 }).limit(200).toArray()
    return json({
      tenant,
      slack: by('slack') ? { ...by('slack'), masked: maskSecret(slack?.secret?.webhook_url || slack?.secret?.bot_token) } : null,
      teams: by('teams') ? { ...by('teams'), masked: maskSecret(teams?.secret?.webhook_url) } : null,
      google_classroom: by('google_classroom'),
      classroom_links: by('google_classroom') ? await classroom.listLinks(tenant) : [],
      classroom_redirect: classroom.callbackUrl(),
      lti: { platforms: await lti.listPlatforms(tenant), stats: await lti.gradeLinkStats(tenant), login_url: lti.loginUrl(), launch_url: lti.launchUrl(), jwks_url: lti.jwksUrl() },
      exams: exams.map((e) => ({ id: String(e.id), title: String(e.title || 'Assessment') })),
    })
  } catch (e) { return errorResponse(e, 'integrations tenant') }
}

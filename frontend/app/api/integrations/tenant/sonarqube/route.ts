/**
 * SonarQube / SonarCloud integration for a tenant.
 *
 * SonarQube uses token-based auth (not OAuth), so this is a simple
 * PUT-to-save / GET-to-read-masked / DELETE-to-remove endpoint.
 *
 * Secret: { token: string }   — SonarQube user or project token
 * Config: { url: string; org?: string }
 *   url — base URL of the SonarQube instance (e.g. https://sonarcloud.io)
 *   org — SonarCloud organisation key (omit for self-hosted SonarQube)
 */
import type { NextRequest } from 'next/server'
import { adminGate, errorResponse, json, tenantOf } from '@/lib/community/http'
import { apiErrorFor } from '@/lib/api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Returns the masked token and current config (no secret). */
export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  const tenant = tenantOf(g.user)
  if (!tenant) return json(apiErrorFor('integration_no_org'), 403)
  try {
    const { getSecret, maskSecret } = await Promise.all([
      import('@/lib/integrations/store'),
      import('@/lib/integrations/chat'),
    ]).then(([s, c]) => ({ getSecret: s.getSecret, maskSecret: c.maskSecret }))
    const result = await getSecret<{ token: string }>(tenant, 'sonarqube')
    return json({
      row: result?.row ?? null,
      masked: result?.secret?.token ? maskSecret(result.secret.token) : null,
    })
  } catch (e) { return errorResponse(e, 'sonarqube get') }
}

interface SonarBody { url?: string; org?: string; token?: string }

/** Save or update the SonarQube connection. Verifies the token before saving. */
export async function PUT(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  const tenant = tenantOf(g.user)
  if (!tenant) return json(apiErrorFor('integration_no_org'), 403)
  try {
    const body = await req.json().catch(() => ({})) as SonarBody
    const rawUrl = typeof body.url === 'string' ? body.url.trim().slice(0, 500).replace(/\/+$/, '') : ''
    const newToken = typeof body.token === 'string' ? body.token.trim().slice(0, 500) : ''
    const org = typeof body.org === 'string' ? body.org.trim().slice(0, 120) : ''
    if (!rawUrl) return json(apiErrorFor('sonar_url_required'), 400)
    let parsed: URL
    try { parsed = new URL(rawUrl) } catch { return json(apiErrorFor('sonar_url_invalid'), 400) }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return json(apiErrorFor('sonar_url_scheme'), 400)
    if (parsed.username || parsed.password) return json(apiErrorFor('sonar_url_credentials'), 400)
    const url = parsed.origin + parsed.pathname.replace(/\/+$/, '')

    // A blank token keeps the stored one (the form never shows it), but only for the same
    // server — a stored token is never sent to a newly entered URL.
    const { getSecret, saveIntegration } = await import('@/lib/integrations/store')
    const stored = await getSecret<{ token: string }>(tenant, 'sonarqube')
    const sameServer = stored?.row?.config?.url === url
    const token = newToken || (sameServer ? stored?.secret?.token || '' : '')
    if (!token) return json(apiErrorFor(stored && !sameServer ? 'sonar_token_reenter' : 'sonar_token_required'), 400)

    // Verify credentials — SonarQube /api/authentication/validate.
    // SEC: the URL is admin-supplied, so it goes through safeFetch (public addresses only,
    // every redirect hop re-checked). A private or unreachable server is saved as `pending`.
    let verified = false
    try {
      const { safeFetch, readTextCapped } = await import('@/lib/url-safety')
      const r = await safeFetch(`${url}/api/authentication/validate`, {
        headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}` },
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) verified = (JSON.parse(await readTextCapped(r, 4096)) as { valid?: boolean }).valid === true
      else await r.body?.cancel().catch(() => {})
    } catch { /* blocked, unreachable or not JSON — saved as pending */ }

    await saveIntegration({
      tenantId: tenant,
      provider: 'sonarqube',
      userId: g.user.id,
      ...(newToken ? { secret: { token } } : {}),
      config: { url, ...(org ? { org } : {}) },
      label: org || parsed.hostname,
      status: verified ? 'connected' : 'pending',
    })
    return json({ ok: true, verified })
  } catch (e) { return errorResponse(e, 'sonarqube put') }
}

/** Disconnect SonarQube. */
export async function DELETE(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  const tenant = tenantOf(g.user)
  if (!tenant) return json(apiErrorFor('integration_no_org'), 403)
  try {
    const { removeIntegration } = await import('@/lib/integrations/store')
    await removeIntegration(tenant, 'sonarqube')
    return json({ ok: true })
  } catch (e) { return errorResponse(e, 'sonarqube delete') }
}

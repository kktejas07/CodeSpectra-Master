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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Returns the masked token and current config (no secret). */
export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  const tenant = tenantOf(g.user)!
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
  const g = await adminGate(req)
  if ('res' in g) return g.res
  const tenant = tenantOf(g.user)!
  try {
    const body = await req.json() as SonarBody
    const url = (body.url || '').trim().replace(/\/$/, '')
    const token = (body.token || '').trim()
    const org = (body.org || '').trim()
    if (!url) return json({ error: 'url required' }, 400)
    if (!token) return json({ error: 'token required' }, 400)

    // Verify credentials — SonarQube /api/authentication/validate
    const verifyUrl = `${url}/api/authentication/validate`
    let verified = false
    try {
      const r = await fetch(verifyUrl, {
        headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}` },
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) {
        const data = await r.json() as { valid?: boolean }
        verified = data.valid === true
      }
    } catch { /* network error — save anyway so admins can configure offline */ }

    const { saveIntegration } = await import('@/lib/integrations/store')
    await saveIntegration({
      tenantId: tenant,
      provider: 'sonarqube',
      userId: g.user.id,
      secret: { token },
      config: { url, ...(org ? { org } : {}) },
      label: org || new URL(url).hostname,
      status: verified ? 'connected' : 'pending',
    })
    return json({ ok: true, verified })
  } catch (e) { return errorResponse(e, 'sonarqube put') }
}

/** Disconnect SonarQube. */
export async function DELETE(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  const tenant = tenantOf(g.user)!
  try {
    const { removeIntegration } = await import('@/lib/integrations/store')
    await removeIntegration(tenant, 'sonarqube')
    return json({ ok: true })
  } catch (e) { return errorResponse(e, 'sonarqube delete') }
}

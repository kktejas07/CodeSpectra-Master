import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { ssoProviders, createSSOProvider } from '@/lib/db/sso'
import { getMongoDb } from '@/lib/mongodb'
import { auditAdmin } from '@/lib/admin-audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const col = await ssoProviders()
  // Never return the client secret (D24); only whether one is set.
  const providers = await col.find({}, { projection: { _id: 0, client_secret: 0 } }).sort({ name: 1 }).toArray()
  const withSecret = await col.find({ client_secret: { $gt: '' } }, { projection: { _id: 0, id: 1 } }).toArray()
  const hasSecret = new Set(withSecret.map((p) => p.id))
  return NextResponse.json({ providers: providers.map((p) => ({ ...p, has_client_secret: hasSecret.has(p.id) })) })
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = await req.json().catch(() => ({})) as Partial<{
    name: string; provider_type: string; issuer: string; client_id: string
    client_secret: string; metadata_url: string; domains: string
    default_role: string; attribute_mapping: string; tenant_id: string
  }>

  if (!body.name || !body.provider_type || !body.issuer || !body.client_id) {
    return NextResponse.json({ error: 'name, provider_type, issuer, client_id required' }, { status: 400 })
  }
  if (!['saml', 'oidc'].includes(body.provider_type)) {
    return NextResponse.json({ error: 'provider_type must be saml or oidc' }, { status: 400 })
  }

  let attributeMapping: Record<string, string> = { email: 'email' }
  if (body.attribute_mapping) {
    try {
      const parsed = JSON.parse(body.attribute_mapping)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
      attributeMapping = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === 'string'),
      ) as Record<string, string>
    } catch {
      return NextResponse.json({ error: 'attribute_mapping must be a JSON object' }, { status: 400 })
    }
  }

  // Optional organisation: users signing in through this provider join it.
  // Without one, the provider can only create plain users (never tenant_admin).
  const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id.trim() : ''
  if (tenantId) {
    try {
      const t = await (await getMongoDb()).collection('tenants').findOne({ id: tenantId }, { projection: { id: 1 } })
      if (!t) return NextResponse.json({ error: 'Organisation not found' }, { status: 400 })
    } catch (e) {
      console.error('[CodeSpectra] admin/sso POST tenant lookup:', e)
      return NextResponse.json({ error: 'Failed to create SSO provider' }, { status: 500 })
    }
  }

  const provider = await createSSOProvider({
    name: body.name,
    provider_type: body.provider_type as 'saml' | 'oidc',
    issuer: body.issuer,
    client_id: body.client_id,
    client_secret: body.client_secret || '',
    metadata_url: body.metadata_url || '',
    attribute_mapping: attributeMapping,
    // tenant_admin only inside an organisation.
    default_role: tenantId && body.default_role === 'tenant_admin' ? 'tenant_admin' : 'user',
    domains: (body.domains || '').split(',').map((d: string) => d.trim()).filter(Boolean),
    enabled: true,
    ...(tenantId ? { tenant_id: tenantId } : {}),
  } as Parameters<typeof createSSOProvider>[0])

  await auditAdmin(gate.user, 'admin.sso.create', 'sso', `sso/${(provider as { id?: string }).id || ''}`, body.name)
  const { client_secret: _secret, ...safe } = provider as unknown as Record<string, unknown>
  return NextResponse.json(safe, { status: 201 })
}

/**
 * PATCH /api/admin/sso?id= — enable/disable or edit a provider (D24).
 * Body (all optional): { enabled, name, domains, default_role, client_secret }.
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const col = await ssoProviders()
  const existing = await col.findOne({ id })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const $set: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.enabled === 'boolean') $set.enabled = body.enabled
  if (typeof body.name === 'string' && body.name.trim()) $set.name = body.name.trim().slice(0, 120)
  if (typeof body.domains === 'string') $set.domains = body.domains.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean).slice(0, 50)
  if (body.default_role === 'user' || body.default_role === 'tenant_admin') {
    const tenant = (existing as { tenant_id?: string }).tenant_id || existing.org_id
    if (body.default_role === 'tenant_admin' && !tenant) {
      return NextResponse.json({ error: 'Organisation admins need a provider linked to an organisation.' }, { status: 400 })
    }
    $set.default_role = body.default_role
  }
  if (typeof body.client_secret === 'string' && body.client_secret) $set.client_secret = body.client_secret.slice(0, 2000)
  if (Object.keys($set).length === 1) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  await col.updateOne({ id }, { $set })
  const { client_secret: _s, ...changed } = $set
  await auditAdmin(gate.user, 'admin.sso.update', 'sso', `sso/${id}`, JSON.stringify({ ...changed, ...(_s ? { client_secret: 'changed' } : {}) }))
  return NextResponse.json({ ok: true })
}

/** DELETE /api/admin/sso?id= — remove a provider. */
export async function DELETE(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const res = await (await ssoProviders()).deleteOne({ id })
  if (res.deletedCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await auditAdmin(gate.user, 'admin.sso.delete', 'sso', `sso/${id}`, undefined, 'warning')
  return NextResponse.json({ ok: true })
}

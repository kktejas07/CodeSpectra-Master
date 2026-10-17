import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { ssoProviders, createSSOProvider } from '@/lib/db/sso'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const col = await ssoProviders()
  const providers = await col.find().sort({ name: 1 }).toArray()
  return NextResponse.json({ providers })
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
    default_role: (body.default_role as 'user' | 'tenant_admin') || 'user',
    domains: (body.domains || '').split(',').map((d: string) => d.trim()).filter(Boolean),
    enabled: true,
    ...(tenantId ? { tenant_id: tenantId } : {}),
  } as Parameters<typeof createSSOProvider>[0])

  return NextResponse.json(provider, { status: 201 })
}

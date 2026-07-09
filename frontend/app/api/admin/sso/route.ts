import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { ssoProviders, createSSOProvider } from '@/lib/db/sso'

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
    default_role: string; attribute_mapping: string
  }>

  if (!body.name || !body.provider_type || !body.issuer || !body.client_id) {
    return NextResponse.json({ error: 'name, provider_type, issuer, client_id required' }, { status: 400 })
  }
  if (!['saml', 'oidc'].includes(body.provider_type)) {
    return NextResponse.json({ error: 'provider_type must be saml or oidc' }, { status: 400 })
  }

  const provider = await createSSOProvider({
    name: body.name,
    provider_type: body.provider_type as 'saml' | 'oidc',
    issuer: body.issuer,
    client_id: body.client_id,
    client_secret: body.client_secret || '',
    metadata_url: body.metadata_url || '',
    attribute_mapping: body.attribute_mapping ? JSON.parse(body.attribute_mapping) : { email: 'email' },
    default_role: (body.default_role as 'user' | 'tenant_admin') || 'user',
    domains: (body.domains || '').split(',').map((d: string) => d.trim()).filter(Boolean),
    enabled: true,
  })

  return NextResponse.json(provider, { status: 201 })
}

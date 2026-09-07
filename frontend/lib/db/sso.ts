import { newId } from './ids'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export { newId }

export interface SSOProviderDoc {
  id: string
  name: string
  provider_type: 'saml' | 'oidc'
  issuer: string
  client_id: string
  client_secret: string
  /** SAML: IdP metadata URL or XML. OIDC: discovery URL. */
  metadata_url: string
  /** Custom attribute mapping (e.g., { email: 'email', name: 'name', role: 'department' }) */
  attribute_mapping: Record<string, string>
  /** Default role assigned to SSO users */
  default_role: 'user' | 'tenant_admin'
  /** Domains that auto-redirect to this provider (e.g., ['company.com']) */
  domains: string[]
  enabled: boolean
  org_id?: string
  created_at: string
  updated_at: string
}

export async function ssoProviders(): Promise<Collection<SSOProviderDoc>> {
  return (await getMongoDb()).collection<SSOProviderDoc>('sso_providers')
}

export async function createSSOProvider(data: Omit<SSOProviderDoc, 'id' | 'created_at' | 'updated_at'>): Promise<SSOProviderDoc> {
  const col = await ssoProviders()
  const doc: SSOProviderDoc = {
    id: newId(),
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  await col.insertOne(doc)
  return doc
}

/**
 * Find the matching SSO provider for a given email domain.
 */
export async function findProviderForEmail(email: string): Promise<SSOProviderDoc | null> {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return null
  const col = await ssoProviders()
  return col.findOne({ domains: domain, enabled: true })
}

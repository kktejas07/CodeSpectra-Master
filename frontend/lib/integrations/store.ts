/**
 * Per-organisation integration settings (Slack, Microsoft Teams, Google
 * Classroom). Secrets (webhook URLs, bot tokens, OAuth refresh tokens, a
 * tenant's own OAuth client secret) are AES-256-GCM encrypted at rest with a
 * key from INTEGRATIONS_ENCRYPTION_KEY (32+ chars) or derived from the session
 * secret; they never leave the server. Rotating the key means reconnecting.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import { lazyCollection } from '@/lib/community/lazy'
import { nowIso } from '@/lib/db/ids'
import { decryptWithKey, encryptWithKey } from '@/lib/ats/interviews/tokens'

export type IntegrationProvider = 'slack' | 'teams' | 'google_classroom'

export interface TenantIntegrationDoc {
  tenant_id: string
  provider: IntegrationProvider
  status: 'connected' | 'error' | 'pending'
  /** Encrypted JSON of the provider's secrets. */
  secret: string | null
  /** Non-secret settings shown in the UI. */
  config: Record<string, unknown>
  account_label: string | null
  last_error: string | null
  connected_by: string
  connected_at: string
  updated_at: string
}

export const integrationsCol = lazyCollection<TenantIntegrationDoc>('tenant_integrations', (c) => Promise.all([
  c.createIndex({ tenant_id: 1, provider: 1 }, { unique: true, name: 'ti_tenant_provider' }),
  c.createIndex({ provider: 1, status: 1 }, { name: 'ti_provider' }),
]))

async function key(): Promise<Uint8Array> {
  const env = (process.env.INTEGRATIONS_ENCRYPTION_KEY || '').trim()
  if (env.length >= 32) return new Uint8Array(createHash('sha256').update(`integrations:${env}`).digest())
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('tenant-integrations-credentials')
}

export async function sealJson(v: unknown): Promise<string> {
  return encryptWithKey(await key(), JSON.stringify(v))
}

export async function openJson<T>(box: string | null | undefined): Promise<T | null> {
  if (!box) return null
  const s = decryptWithKey(await key(), box)
  if (s === null) return null
  try { return JSON.parse(s) as T } catch { return null }
}

export async function getIntegration(tenantId: string, provider: IntegrationProvider) {
  return (await integrationsCol()).findOne({ tenant_id: tenantId, provider }, { projection: { _id: 0 } })
}

export async function getSecret<T>(tenantId: string, provider: IntegrationProvider): Promise<{ row: TenantIntegrationDoc; secret: T | null } | null> {
  const row = await getIntegration(tenantId, provider)
  if (!row) return null
  return { row, secret: await openJson<T>(row.secret) }
}

export async function saveIntegration(p: { tenantId: string; provider: IntegrationProvider; userId: string; secret?: unknown; config?: Record<string, unknown>; label?: string | null; status?: TenantIntegrationDoc['status'] }) {
  const now = nowIso()
  const set: Partial<TenantIntegrationDoc> = { status: p.status ?? 'connected', updated_at: now, last_error: null, connected_by: p.userId }
  if (p.secret !== undefined) set.secret = p.secret === null ? null : await sealJson(p.secret)
  if (p.config) set.config = p.config
  if (p.label !== undefined) set.account_label = p.label
  await (await integrationsCol()).updateOne(
    { tenant_id: p.tenantId, provider: p.provider },
    { $set: set, $setOnInsert: { tenant_id: p.tenantId, provider: p.provider, connected_at: now, ...(p.config ? {} : { config: {} }), ...(p.label !== undefined ? {} : { account_label: null }), ...(p.secret !== undefined ? {} : { secret: null }) } },
    { upsert: true },
  )
}

export async function markIntegrationError(tenantId: string, provider: IntegrationProvider, message: string) {
  await (await integrationsCol()).updateOne({ tenant_id: tenantId, provider }, { $set: { status: 'error', last_error: message.slice(0, 300), updated_at: nowIso() } }).catch(() => {})
}

export async function removeIntegration(tenantId: string, provider: IntegrationProvider) {
  await (await integrationsCol()).deleteOne({ tenant_id: tenantId, provider })
}

/** Public view (no secrets). */
export async function listIntegrations(tenantId: string) {
  const rows = await (await integrationsCol()).find({ tenant_id: tenantId }, { projection: { _id: 0, secret: 0 } }).toArray()
  return rows
}

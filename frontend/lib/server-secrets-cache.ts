/**
 * Dynamic integration secrets stored in MongoDB (`platform_settings` collection
 * under key `secrets`). Read by API routes (Razorpay, email providers, …) so
 * admins can rotate credentials from `/dashboard/admin/settings` without
 * touching .env files or redeploying.
 *
 * Fallback chain at runtime:
 *   1. value from MongoDB cache (admin-saved)
 *   2. value from process.env
 */
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export const SERVER_SECRETS_PLATFORM_KEY = 'secrets'

export type ServerSecretsRecord = {
  resend_api_key?: string
  resend_from_email?: string
  sendgrid_api_key?: string
  sendgrid_from_email?: string
  // --- Razorpay -----------------------------------------------------------
  razorpay_key_id?: string
  razorpay_key_secret?: string
  razorpay_webhook_secret?: string
  // --- Better Auth runtime trusted origins (comma- or newline-separated) --
  trusted_origins_extra?: string
  // --- Code execution backend (Piston-compatible URL, no trailing slash) -
  piston_url?: string
  // --- GitHub App (PR-comment posting) -----------------------------------
  github_app_token?: string
  // --- GitHub OAuth App (lets users connect their account) ---------------
  github_client_id?: string
  github_client_secret?: string
  // --- Legacy Stripe (kept for back-compat reads only) -------------------
  stripe_secret_key?: string
  stripe_webhook_secret?: string
  stripe_price_pro_monthly?: string
  stripe_price_pro_yearly?: string
  stripe_price_enterprise_monthly?: string
  stripe_price_enterprise_yearly?: string
  // --- Firebase client config (superadmin settings UI, no redeploy) ----
  firebase_api_key?: string
  firebase_auth_domain?: string
  firebase_project_id?: string
  firebase_storage_bucket?: string
  firebase_messaging_sender_id?: string
  firebase_app_id?: string
}

interface PlatformSettingDoc {
  key: string
  value: Record<string, unknown>
  updated_at: string
}

async function settingsCol(): Promise<Collection<PlatformSettingDoc>> {
  return (await getMongoDb()).collection<PlatformSettingDoc>('platform_settings')
}

let cached: ServerSecretsRecord | null = null
let cacheValid = false
let inflight: Promise<void> | null = null

export function invalidateServerSecretsCache(): void {
  cached = null
  cacheValid = false
  inflight = null
}

export async function warmServerSecretsCache(): Promise<void> {
  if (cacheValid) return
  if (inflight) {
    await inflight
    return
  }
  inflight = (async () => {
    try {
      const col = await settingsCol()
      const doc = await col.findOne({ key: SERVER_SECRETS_PLATFORM_KEY })
      cached = (doc?.value as ServerSecretsRecord) || {}
    } catch (e) {
      console.error('[CodeSpectra] server secrets load:', e)
      cached = {}
    } finally {
      cacheValid = true
    }
  })()
  await inflight
  inflight = null
}

export function getServerSecretsFromCache(): ServerSecretsRecord {
  if (cacheValid && cached) return cached
  return {}
}

/**
 * Load secrets from cache (warming first if needed). Async — call from API
 * routes that need to read the current values.
 */
export async function readServerSecrets(): Promise<ServerSecretsRecord> {
  await warmServerSecretsCache()
  return getServerSecretsFromCache()
}

/**
 * Persist new server secrets and invalidate the in-memory cache. Returns the
 * merged record (existing values are preserved if not supplied in `patch`).
 */
export async function writeServerSecrets(
  patch: Partial<ServerSecretsRecord>,
): Promise<ServerSecretsRecord> {
  const col = await settingsCol()
  const existing = await col.findOne({ key: SERVER_SECRETS_PLATFORM_KEY })
  const prev = (existing?.value as ServerSecretsRecord) || {}
  const next: ServerSecretsRecord = { ...prev }
  for (const [k, v] of Object.entries(patch) as [keyof ServerSecretsRecord, unknown][]) {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
      delete next[k]
    } else if (typeof v === 'string') {
      next[k] = v.trim() as never
    }
  }
  await col.updateOne(
    { key: SERVER_SECRETS_PLATFORM_KEY },
    { $set: { value: next as unknown as Record<string, unknown>, updated_at: new Date().toISOString() } },
    { upsert: true },
  )
  invalidateServerSecretsCache()
  return next
}

/** Mask API keys for admin UI (never return full secrets). */
export function maskSecret(value: string | undefined | null): string | null {
  const v = (value || '').trim()
  if (!v) return null
  if (v.length <= 8) return '••••••••'
  return `${v.slice(0, 4)}••••${v.slice(-4)}`
}

/**
 * Returns the normalised list of additional trusted origins configured by the
 * admin in MongoDB. Strips whitespace + trailing slashes; lowercases scheme/host
 * for tolerant matching.
 */
export async function readTrustedOrigins(): Promise<string[]> {
  const secrets = await readServerSecrets()
  const raw = (secrets.trusted_origins_extra || '').trim()
  if (!raw) return []
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s.length > 0 && /^https?:\/\//i.test(s))
}

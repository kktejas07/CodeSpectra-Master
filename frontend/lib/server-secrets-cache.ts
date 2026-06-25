/**
 * Server-only: optional integration secrets stored in `platform_settings` (key `secrets`).
 * Used when the corresponding environment variable is unset. Cache is warmed per request as needed.
 */

import { getServiceSupabase } from '@/lib/admin-service-client'

export const SERVER_SECRETS_PLATFORM_KEY = 'secrets'

export type ServerSecretsRecord = {
  resend_api_key?: string
  resend_from_email?: string
  sendgrid_api_key?: string
  sendgrid_from_email?: string
  stripe_secret_key?: string
  stripe_webhook_secret?: string
  stripe_price_pro_monthly?: string
  stripe_price_pro_yearly?: string
  stripe_price_enterprise_monthly?: string
  stripe_price_enterprise_yearly?: string
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
      const supabase = getServiceSupabase()
      if (!supabase) {
        cached = {}
        return
      }
      const { data, error } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', SERVER_SECRETS_PLATFORM_KEY)
        .maybeSingle()
      if (error) {
        console.error('[CodeSpectra] server secrets load:', error.message)
        cached = {}
      } else {
        cached = (data?.value as ServerSecretsRecord) || {}
      }
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

/** Mask API keys for admin UI (never return full secrets). */
export function maskSecret(value: string | undefined | null): string | null {
  const v = (value || '').trim()
  if (!v) return null
  if (v.length <= 8) return '••••••••'
  return `${v.slice(0, 4)}••••${v.slice(-4)}`
}

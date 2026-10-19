/**
 * Optional third-party analytics / ad tags, configured by the platform admin
 * (Admin → Settings → Analytics; stored in platform_settings.secrets via
 * lib/server-secrets-fields.ts — these are public browser ids, not secrets).
 *
 * Every id is checked against a strict pattern before it is ever put in a
 * script URL or inline snippet; anything else is ignored. Tags load only after
 * consent: analytics tags with "analytics", ad tags with "marketing".
 */
import type { TagCategory } from './consent'
import { validateCustomEventList } from './guard'

export interface IntegrationDef {
  key: 'ga4_measurement_id' | 'gtm_container_id' | 'posthog_project_key' | 'posthog_host' | 'clarity_project_id' | 'meta_pixel_id' | 'linkedin_partner_id' // gitleaks:allow (field names, not secrets)
  label: string
  pattern: RegExp
  placeholder: string
  category: TagCategory
  hint?: string
}

export const INTEGRATION_FIELDS: readonly IntegrationDef[] = [
  { key: 'ga4_measurement_id', label: 'Google Analytics 4 measurement ID', pattern: /^G-[A-Z0-9]{4,20}$/, placeholder: 'G-XXXXXXXXXX', category: 'analytics' }, // gitleaks:allow (field names, not secrets)
  { key: 'gtm_container_id', label: 'Google Tag Manager container ID', pattern: /^GTM-[A-Z0-9]{4,12}$/, placeholder: 'GTM-XXXXXXX', category: 'analytics', hint: 'Loads with analytics consent; Consent Mode v2 tells your tags whether ad storage is allowed.' },
  { key: 'posthog_project_key', label: 'PostHog project API key', pattern: /^phc_[A-Za-z0-9]{20,64}$/, placeholder: 'phc_…', category: 'analytics' },
  // W4-19: only PostHog Cloud hosts — the CSP (proxy.ts, TAG_*_HOSTS) allows *.posthog.com and nothing else.
  { key: 'posthog_host', label: 'PostHog host', pattern: /^https:\/\/([a-z0-9-]+\.)*posthog\.com$/i, placeholder: 'https://us.i.posthog.com', category: 'analytics', hint: 'A PostHog Cloud host: https://us.i.posthog.com or https://eu.i.posthog.com. Self-hosted / proxied PostHog is blocked by the Content Security Policy.' },
  { key: 'clarity_project_id', label: 'Microsoft Clarity project ID', pattern: /^[a-z0-9]{6,16}$/, placeholder: 'abcd1234ef', category: 'analytics' },
  { key: 'meta_pixel_id', label: 'Meta Pixel ID', pattern: /^\d{10,20}$/, placeholder: '123456789012345', category: 'marketing' },
  { key: 'linkedin_partner_id', label: 'LinkedIn Insight partner ID', pattern: /^\d{4,12}$/, placeholder: '1234567', category: 'marketing' },
]

export type IntegrationKey = IntegrationDef['key']

export interface PublicAnalyticsConfig {
  ga4?: string
  gtm?: string
  posthog?: { key: string; host: string }
  clarity?: string
  metaPixel?: string
  linkedin?: string
}

const valid = (key: IntegrationKey, v: unknown): string | undefined => {
  const def = INTEGRATION_FIELDS.find((f) => f.key === key)!
  const s = typeof v === 'string' ? v.trim() : ''
  return s && def.pattern.test(s) ? s : undefined
}

/** Pure: stored record → ids safe to render. */
export function publicConfigFrom(rec: Record<string, unknown>): PublicAnalyticsConfig {
  const c: PublicAnalyticsConfig = {}
  const ga4 = valid('ga4_measurement_id', rec.ga4_measurement_id); if (ga4) c.ga4 = ga4
  const gtm = valid('gtm_container_id', rec.gtm_container_id); if (gtm) c.gtm = gtm
  const ph = valid('posthog_project_key', rec.posthog_project_key)
  if (ph) c.posthog = { key: ph, host: valid('posthog_host', rec.posthog_host) || 'https://us.i.posthog.com' }
  const cl = valid('clarity_project_id', rec.clarity_project_id); if (cl) c.clarity = cl
  const mp = valid('meta_pixel_id', rec.meta_pixel_id); if (mp) c.metaPixel = mp
  const li = valid('linkedin_partner_id', rec.linkedin_partner_id); if (li) c.linkedin = li
  return c
}

/** Validation for the admin save: field → error message (empty string clears a field). */
export function validateIntegrationPatch(patch: Record<string, unknown>): string | null {
  for (const def of INTEGRATION_FIELDS) {
    if (!(def.key in patch)) continue
    const v = patch[def.key]
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) continue
    if (typeof v !== 'string' || !def.pattern.test(v.trim())) return `${def.label} doesn't look right (expected ${def.placeholder}).`
  }
  if ('analytics_custom_events' in patch) {
    const bad = validateCustomEventList(patch.analytics_custom_events)
    if (bad) return bad
  }
  if ('analytics_retention_days' in patch) {
    const v = patch.analytics_retention_days
    if (v !== null && v !== '' && v !== undefined) {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 30 || n > 1500) return 'Raw event retention must be a whole number of days between 30 and 1500.'
    }
  }
  return null
}

/** Script hosts the tags need (kept in one place for the CSP). */
export const TAG_SCRIPT_HOSTS = [
  'https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://*.posthog.com',
  'https://www.clarity.ms', 'https://*.clarity.ms', 'https://connect.facebook.net', 'https://snap.licdn.com',
] as const
export const TAG_CONNECT_HOSTS = [
  'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com',
  'https://*.posthog.com', 'https://*.clarity.ms', 'https://www.facebook.com', 'https://px.ads.linkedin.com',
] as const
export const TAG_FRAME_HOSTS = ['https://www.googletagmanager.com'] as const

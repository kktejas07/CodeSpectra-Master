/**
 * Defaults and types for `platform_settings` row `key = 'general'`.
 * Shared by GET/PATCH `/api/admin/platform-settings` and admin user provisioning.
 */
export const ADMIN_NEW_USER_EMAIL_DELIVERIES = [
  'postal_recovery',
  'postal_magiclink',
] as const

export type AdminNewUserEmailDelivery = (typeof ADMIN_NEW_USER_EMAIL_DELIVERIES)[number]

export function normalizeAdminNewUserEmailDelivery(v: unknown): AdminNewUserEmailDelivery {
  const s = typeof v === 'string' ? v.trim() : ''
  if ((ADMIN_NEW_USER_EMAIL_DELIVERIES as readonly string[]).includes(s)) {
    return s as AdminNewUserEmailDelivery
  }
  return 'postal_recovery'
}

export type GeneralPlatformSettings = {
  platform_name: string
  platform_tagline: string
  logo_url: string
  favicon_url: string
  support_email: string
  support_link_url: string
  timezone: string
  default_locale: string
  allow_registration: boolean
  email_notifications: boolean
  maintenance_mode: boolean
  require_email_verification: boolean
  show_public_leaderboard: boolean
  /** Whether the Ask CodeSpectra chatbot is available globally */
  enable_chatbot: boolean
  /** Platform-wide currency for pricing display */
  platform_currency: string
  /** How to notify users when an admin creates an account without setting a password. */
  admin_new_user_email_delivery: AdminNewUserEmailDelivery
  /** Whether to show the Enterprise SSO login button on the login page */
  enable_sso_login: boolean
  /** Routes that show a "Coming Soon" lock screen. Superadmin can toggle from /dashboard/admin/permissions. */
  locked_pages: string[]
  /** Sub-page features that are locked (e.g. "scanner:github"). Superadmin can toggle from /dashboard/admin/permissions. */
  locked_features: string[]
  /** Company legal name (shown in footer) */
  company_name: string
  /** Copyright line e.g. "© 2026 CodeSpectra" — leave empty to use platform_name */
  copyright_text: string
  /** Physical address shown in footer and emails */
  company_address: string
  /** Website URL shown in footer and emails */
  website_url: string
  /** Privacy policy URL */
  privacy_policy_url: string
  /** Terms of service URL */
  terms_of_service_url: string
  /** Default certificate template used across all events */
  certificate_template: 'classic' | 'modern' | 'minimal' | 'professional' | 'corporate' | 'academic'
  /** Primary color hex for Vidstack player */
  video_player_primary_color: string
  /** Whether the video player should autoplay by default */
  video_player_autoplay: boolean
  /** Whether the video player is muted by default */
  video_player_muted: boolean
}

export const GENERAL_PLATFORM_DEFAULTS: GeneralPlatformSettings = {
  platform_name: 'CodeSpectra',
  platform_tagline: '',
  logo_url: '',
  favicon_url: '',
  support_email: 'support@codespectra.com',
  support_link_url: '',
  timezone: 'UTC',
  default_locale: 'en',
  allow_registration: true,
  email_notifications: true,
  maintenance_mode: false,
  require_email_verification: false,
  show_public_leaderboard: true,
  enable_chatbot: true,
  platform_currency: 'USD',
  admin_new_user_email_delivery: 'postal_recovery',
  enable_sso_login: false,
  locked_pages: [],
  locked_features: [],
  company_name: 'CodeSpectra',
  copyright_text: '',
  company_address: '',
  website_url: '',
  privacy_policy_url: '',
  terms_of_service_url: '',
  certificate_template: 'classic',
  video_player_primary_color: '#34d399', // Default CodeSpectra green
  video_player_autoplay: false,
  video_player_muted: false,
}

export function mergeGeneralPlatformSettings(
  raw: Record<string, unknown> | undefined | null
): GeneralPlatformSettings {
  const merged: Record<string, unknown> = { ...GENERAL_PLATFORM_DEFAULTS, ...(raw || {}) }
  merged.admin_new_user_email_delivery = normalizeAdminNewUserEmailDelivery(
    merged.admin_new_user_email_delivery
  )
  // Ensure locked_pages is always an array of strings
  if (!Array.isArray(merged.locked_pages)) {
    merged.locked_pages = []
  }
  if (!Array.isArray(merged.locked_features)) {
    merged.locked_features = []
  }
  return merged as GeneralPlatformSettings
}

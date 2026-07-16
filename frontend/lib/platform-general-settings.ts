/**
 * Defaults and types for `platform_settings` row `key = 'general'`.
 * Shared by GET/PATCH `/api/admin/platform-settings` and admin user provisioning.
 */

export const ADMIN_NEW_USER_EMAIL_DELIVERIES = [
  'resend_recovery',
  'resend_magiclink',
  'sendgrid_recovery',
  'sendgrid_magiclink',
  'postal_recovery',
  'postal_magiclink',
  'smtp_recovery',
  'smtp_magiclink',
] as const

export type AdminNewUserEmailDelivery = (typeof ADMIN_NEW_USER_EMAIL_DELIVERIES)[number]

export function normalizeAdminNewUserEmailDelivery(v: unknown): AdminNewUserEmailDelivery {
  const s = typeof v === 'string' ? v.trim() : ''
  if ((ADMIN_NEW_USER_EMAIL_DELIVERIES as readonly string[]).includes(s)) {
    return s as AdminNewUserEmailDelivery
  }
  return 'resend_recovery'
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
  /** Platform-wide currency for pricing display */
  platform_currency: string
  /** How to notify users when an admin creates an account without setting a password. */
  admin_new_user_email_delivery: AdminNewUserEmailDelivery
  /** Routes that show a "Coming Soon" lock screen. Superadmin can toggle from /dashboard/admin/permissions. */
  locked_pages: string[]
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
  platform_currency: 'USD',
  admin_new_user_email_delivery: 'resend_recovery',
  locked_pages: [],
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
  return merged as GeneralPlatformSettings
}

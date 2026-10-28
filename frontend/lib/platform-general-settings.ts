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

/** Transcript panel modes for the course video player. Follows the ADMIN_NEW_USER_EMAIL_DELIVERIES pattern. */
export const VIDEO_PLAYER_TRANSCRIPT_MODES = ['open', 'closed', 'off'] as const

export type VideoPlayerTranscriptMode = (typeof VIDEO_PLAYER_TRANSCRIPT_MODES)[number]

export function normalizeVideoPlayerTranscriptMode(v: unknown): VideoPlayerTranscriptMode {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if ((VIDEO_PLAYER_TRANSCRIPT_MODES as readonly string[]).includes(s)) {
    return s as VideoPlayerTranscriptMode
  }
  return 'closed'
}

/** Clamp a playback speed to Vidstack's usable range, falling back on garbage. */
export function coercePlaybackSpeed(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v)
  if (Number.isFinite(n) && n >= 0.25 && n <= 4) return n
  return fallback
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
  /** Logo / watermark image shown in the player controls (Vidstack DefaultVideoLayout logo slot) */
  video_player_logo_url: string
  /** Optional URL the player logo links to when clicked */
  video_player_logo_link_url: string
  /** When true, captions/subtitles start on by default in the course player */
  video_player_captions_default: boolean
  /** Default playback speed for the course player (user's saved choice in localStorage wins) */
  video_player_default_speed: number
  /** Transcript panel under the course player: open | closed | off */
  video_player_transcript: VideoPlayerTranscriptMode
  /** When true, a chapters track is generated client-side and shown in the player menu */
  video_player_chapters: boolean
  /** When true, ending a lesson shows a 3s "Up next" overlay that auto-navigates */
  video_player_autoplay_next: boolean
  /** When false, the picture-in-picture button is hidden from the player */
  video_player_pip: boolean
  /** Superadmins + tenant admins must turn on 2FA (after the grace period). */
  enforce_admin_2fa: boolean
  /** Days an admin without 2FA can keep signing in before it is enforced. */
  admin_2fa_grace_days: number
  /** Days after an exam closes before ID photos, selfies and face templates are purged. */
  identity_media_retention_days: number
  /** Dev/demo only: offer the 'Simulated vendor' for background checks in production. */
  bgv_simulated_vendor: boolean
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
  // SEC-006: on by default; legacy accounts are grandfathered (lib/auth-policy).
  require_email_verification: true,
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
  video_player_logo_url: '',
  video_player_logo_link_url: '',
  video_player_captions_default: true,
  video_player_default_speed: 1,
  video_player_transcript: 'closed',
  video_player_chapters: true,
  video_player_autoplay_next: false,
  video_player_pip: true,
  enforce_admin_2fa: true,
  admin_2fa_grace_days: 14,
  identity_media_retention_days: 180,
  bgv_simulated_vendor: false,
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback
}

export function coercePlatformBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true
    if (s === 'false' || s === '0' || s === 'no' || s === 'off' || s === '') return false
  }
  if (v == null) return fallback
  return Boolean(v)
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
  // Strict bools so "false" strings / missing keys cannot flip toggles back on
  merged.video_player_autoplay = coercePlatformBool(
    merged.video_player_autoplay,
    GENERAL_PLATFORM_DEFAULTS.video_player_autoplay,
  )
  merged.video_player_muted = coercePlatformBool(
    merged.video_player_muted,
    GENERAL_PLATFORM_DEFAULTS.video_player_muted,
  )
  merged.video_player_captions_default = coercePlatformBool(
    merged.video_player_captions_default,
    GENERAL_PLATFORM_DEFAULTS.video_player_captions_default,
  )
  merged.video_player_default_speed = coercePlaybackSpeed(
    merged.video_player_default_speed,
    GENERAL_PLATFORM_DEFAULTS.video_player_default_speed,
  )
  merged.video_player_transcript = normalizeVideoPlayerTranscriptMode(merged.video_player_transcript)
  merged.video_player_chapters = coercePlatformBool(
    merged.video_player_chapters,
    GENERAL_PLATFORM_DEFAULTS.video_player_chapters,
  )
  merged.video_player_autoplay_next = coercePlatformBool(
    merged.video_player_autoplay_next,
    GENERAL_PLATFORM_DEFAULTS.video_player_autoplay_next,
  )
  merged.video_player_pip = coercePlatformBool(
    merged.video_player_pip,
    GENERAL_PLATFORM_DEFAULTS.video_player_pip,
  )
  for (const k of ['allow_registration', 'maintenance_mode', 'require_email_verification', 'enforce_admin_2fa', 'bgv_simulated_vendor'] as const) {
    merged[k] = coercePlatformBool(merged[k], GENERAL_PLATFORM_DEFAULTS[k])
  }
  merged.admin_2fa_grace_days = clampInt(merged.admin_2fa_grace_days, 0, 90, GENERAL_PLATFORM_DEFAULTS.admin_2fa_grace_days)
  merged.identity_media_retention_days = clampInt(merged.identity_media_retention_days, 1, 3650, GENERAL_PLATFORM_DEFAULTS.identity_media_retention_days)
  return merged as GeneralPlatformSettings
}

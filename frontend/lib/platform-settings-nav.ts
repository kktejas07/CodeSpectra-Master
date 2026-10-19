export const PLATFORM_SETTINGS_SECTIONS = [
  'branding',
  'media',
  'cloudflare',
  'mail',
  'ops',
  'product',
  'certificates',
  'integrations',
  'hiring',
  'payments',
  'email-templates',
  'llm',
  'gamification',
  'kyc',
  'redis',
  'whatsapp',
] as const

export type PlatformSettingsSection = (typeof PLATFORM_SETTINGS_SECTIONS)[number]

export function parsePlatformSettingsSection(raw: string | null | undefined): PlatformSettingsSection {
  const s = (raw || '').toLowerCase().trim()
  if (PLATFORM_SETTINGS_SECTIONS.includes(s as PlatformSettingsSection)) {
    return s as PlatformSettingsSection
  }
  return 'branding'
}

export function platformSettingsHref(section: PlatformSettingsSection): string {
  return `/dashboard/admin/settings?section=${section}`
}

/**
 * Footer copyright line. The legal name matches the Terms / Privacy pages and
 * the SEO organization default (lib/seo/settings-shared.ts → legal_name).
 * The year is computed, never hard-coded.
 */
export const COPYRIGHT_HOLDER = 'CodeSpectra'

export function copyrightLine(now: Date = new Date()): string {
  return `© ${now.getFullYear()} ${COPYRIGHT_HOLDER}`
}

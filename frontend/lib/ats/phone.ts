/**
 * Phone helpers for candidates: E.164 via lib/whatsapp normalizePhone. Pure.
 */
import { normalizePhone } from '@/lib/whatsapp'

/** ISO-2 → calling code for the regions we hire in most. Unknown → no default. */
export const DIAL_CODES: Record<string, string> = {
  IN: '91', US: '1', CA: '1', GB: '44', AE: '971', SA: '966', QA: '974', SG: '65', MY: '60',
  AU: '61', NZ: '64', DE: '49', FR: '33', NL: '31', IE: '353', PH: '63', LK: '94', BD: '880',
  NP: '977', PK: '92', ZA: '27', NG: '234', KE: '254', JP: '81', KR: '82', CN: '86', BR: '55', MX: '52',
}

const DIAL_TO_ISO: [string, string][] = Object.entries(DIAL_CODES)
  .filter(([iso]) => iso !== 'CA') // +1 → US by default
  .map(([iso, code]) => [code, iso] as [string, string])
  .sort((a, b) => b[0].length - a[0].length)

/**
 * E.164 ("+919876543210") or null. A number without a country code takes the
 * candidate's country (default IN). Rejects anything outside 8–15 digits.
 */
export function toE164(raw: unknown, country?: string | null): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const s = String(raw).trim()
  if (!s) return null
  const hasPlus = s.startsWith('+') || s.startsWith('00')
  const cleaned = s.startsWith('00') ? `+${s.slice(2)}` : s
  const cc = hasPlus ? undefined : DIAL_CODES[(country || 'IN').toUpperCase()] ?? undefined
  const chat = normalizePhone(cleaned, cc)
  if (!chat) return null
  const digits = chat.replace(/@c\.us$/, '')
  if (!/^\d{8,15}$/.test(digits)) return null
  return `+${digits}`
}

/** ISO-2 guess from an E.164 number (longest calling-code prefix). */
export function countryFromE164(e164: string | null | undefined): string | null {
  if (!e164 || !e164.startsWith('+')) return null
  const d = e164.slice(1)
  for (const [code, iso] of DIAL_TO_ISO) if (d.startsWith(code)) return iso
  return null
}

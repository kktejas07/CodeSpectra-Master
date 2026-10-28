/**
 * Region routing: pick the WhatsApp sender + regional caller number for a
 * candidate. Tenant registry first (exact country, then '*'), then platform
 * defaults (per-country Vapi numbers, then the default WhatsApp number).
 */
import type { RegionNumber } from './types'
import { toE164 } from '@/lib/ats/phone'

// Calling code → ISO-2. Longest prefix wins. ponytail: shared codes (+1, +7, +44
// territories) map to the largest country; set candidate.country to override.
const CALLING_CODES: Record<string, string> = {
  '1': 'US', '7': 'RU', '20': 'EG', '27': 'ZA', '30': 'GR', '31': 'NL', '32': 'BE', '33': 'FR', '34': 'ES',
  '36': 'HU', '39': 'IT', '40': 'RO', '41': 'CH', '43': 'AT', '44': 'GB', '45': 'DK', '46': 'SE', '47': 'NO',
  '48': 'PL', '49': 'DE', '52': 'MX', '54': 'AR', '55': 'BR', '56': 'CL', '57': 'CO', '60': 'MY', '61': 'AU',
  '62': 'ID', '63': 'PH', '64': 'NZ', '65': 'SG', '66': 'TH', '81': 'JP', '82': 'KR', '84': 'VN', '86': 'CN',
  '90': 'TR', '91': 'IN', '92': 'PK', '94': 'LK', '95': 'MM', '234': 'NG', '254': 'KE', '351': 'PT',
  '353': 'IE', '358': 'FI', '852': 'HK', '880': 'BD', '886': 'TW', '960': 'MV', '961': 'LB', '962': 'JO',
  '965': 'KW', '966': 'SA', '968': 'OM', '971': 'AE', '972': 'IL', '973': 'BH', '974': 'QA', '977': 'NP',
}

export { toE164 } from '@/lib/ats/phone'

export function countryFromPhone(phone: string | null | undefined): string | null {
  const e164 = toE164(phone)
  if (!e164) return null
  const digits = e164.slice(1)
  for (const len of [3, 2, 1]) {
    const hit = CALLING_CODES[digits.slice(0, len)]
    if (hit) return hit
  }
  return null
}

export function resolveCountry(candidate: { country?: string | null; phone?: string | null }): string | null {
  const c = (candidate.country || '').trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(c)) return c
  return countryFromPhone(candidate.phone)
}

export interface PlatformNumbers {
  whatsapp_phone_number_id?: string | null
  /** ISO-2 → Vapi phoneNumberId ('*' = default) */
  vapi_numbers: Record<string, string>
}

export interface RoutedNumbers {
  country: string | null
  whatsapp_phone_number_id: string | null
  vapi_phone_number_id: string | null
  call_number: string | null
  provider: RegionNumber['provider'] | null
  source: { whatsapp: 'tenant' | 'platform' | null; call: 'tenant' | 'platform' | null }
}

export function pickRegionNumbers(
  candidate: { country?: string | null; phone?: string | null },
  tenantRegions: Record<string, RegionNumber> | null | undefined,
  platform: PlatformNumbers,
): RoutedNumbers {
  const country = resolveCountry(candidate)
  const regions = tenantRegions || {}
  const tenantHit = (country && regions[country]) || null
  const tenantDefault = regions['*'] || null

  const waTenant = tenantHit?.whatsapp_phone_number_id || tenantDefault?.whatsapp_phone_number_id || null
  const callTenantRegion = tenantHit?.vapi_phone_number_id ? tenantHit : tenantDefault?.vapi_phone_number_id ? tenantDefault : null
  const vapiPlatform = (country && platform.vapi_numbers[country]) || platform.vapi_numbers['*'] || null

  return {
    country,
    whatsapp_phone_number_id: waTenant || platform.whatsapp_phone_number_id || null,
    vapi_phone_number_id: callTenantRegion?.vapi_phone_number_id || vapiPlatform,
    call_number: callTenantRegion?.call_number || null,
    provider: callTenantRegion?.provider || (vapiPlatform ? 'vapi' : null),
    source: {
      whatsapp: waTenant ? 'tenant' : platform.whatsapp_phone_number_id ? 'platform' : null,
      call: callTenantRegion ? 'tenant' : vapiPlatform ? 'platform' : null,
    },
  }
}

/** "IN=pn_123, US=pn_456, *=pn_789" (or JSON object) → record. Invalid entries are dropped. */
export function parseRegionMap(raw: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  const s = (raw || '').trim()
  if (!s) return out
  if (s.startsWith('{')) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(s) as Record<string, unknown>)) {
        const key = k.trim().toUpperCase()
        if ((key === '*' || /^[A-Z]{2}$/.test(key)) && typeof v === 'string' && v.trim()) out[key] = v.trim()
      }
    } catch { /* fall through: empty */ }
    return out
  }
  for (const part of s.split(/[,\n;]/)) {
    const [k, v] = part.split('=').map((x) => x?.trim())
    const key = (k || '').toUpperCase()
    if ((key === '*' || /^[A-Z]{2}$/.test(key)) && v) out[key] = v
  }
  return out
}

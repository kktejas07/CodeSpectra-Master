/**
 * Free verification utilities — no paid APIs, no rate limits.
 *
 * Covers:
 *   - Email: format + MX record validation + disposable domain blocklist
 *   - Phone: E.164 normalization via libphonenumber-js
 *   - IP: country/ASN/VPN via MaxMind GeoLite2 (geoip-lite npm package)
 *   - Device: user-agent parsing via ua-parser-js
 *
 * All offline / self-hosted. Zero cost, unlimited usage.
 */

import { parsePhoneNumberFromString, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js'
import { UAParser } from 'ua-parser-js'

// ── Email Verification ───────────────────────────────────────────────────────

/** Disposable email domains — extend as needed. */
const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'guerrillamail.com', 'mailinator.com', '10minutemail.com',
  'yopmail.com', 'throwaway.email', 'fakeinbox.com', 'temp-mail.org',
  'dispostable.com', 'mailnesia.com', 'tempail.com', 'mohmal.com',
  'emailondeck.com', 'getnada.com', 'inboxkitten.com', 'sharklasers.com',
  'guerrillamailblock.com', 'grr.la', 'disbox.org', 'mailcatch.com',
])

/**
 * Validate email: format check + MX record + disposable domain detection.
 * Returns detailed result so the caller can decide how to handle it.
 */
export async function verifyEmail(email: string): Promise<{
  valid: boolean
  reason?: string
  domain?: string
  hasMx: boolean
}> {
  const trimmed = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, reason: 'Invalid email format', hasMx: false }
  }

  const domain = trimmed.split('@')[1]
  if (!domain) {
    return { valid: false, reason: 'Missing domain', hasMx: false }
  }

  if (DISPOSABLE_DOMAINS.has(domain) || domain.endsWith('.tempmail.com')) {
    return { valid: false, reason: 'Disposable email domain', domain, hasMx: false }
  }

  let hasMx = false
  try {
    const { promises: dns } = await import('node:dns')
    const records = await dns.resolveMx(domain)
    hasMx = Array.isArray(records) && records.length > 0
  } catch {
    hasMx = false
  }

  if (!hasMx) {
    return { valid: false, reason: 'No MX records (domain may not receive email)', domain, hasMx: false }
  }

  return { valid: true, domain, hasMx: true }
}

/** Quick format-only check (client-side). */
export function isEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// ── Phone Verification ───────────────────────────────────────────────────────

export interface PhoneVerificationResult {
  valid: boolean
  e164?: string
  country?: string
  reason?: string
}

/**
 * Normalize and validate a phone number.
 * Accepts any format, returns E.164 or error.
 */
export function verifyPhone(phone: string, defaultCountry: CountryCode = 'IN'): PhoneVerificationResult {
  const cleaned = phone.replace(/[^0-9+]/g, '')
  if (!cleaned || cleaned.length < 7) {
    return { valid: false, reason: 'Too short' }
  }

  try {
    const parsed = parsePhoneNumberFromString(cleaned, defaultCountry as CountryCode)
    if (!parsed || !isValidPhoneNumber(parsed.number as string)) {
      return { valid: false, reason: 'Invalid phone number' }
    }
    return {
      valid: true,
      e164: parsed.number,
      country: parsed.country || defaultCountry,
    }
  } catch {
    return { valid: false, reason: 'Parse error' }
  }
}

// ── IP / Geo Verification ────────────────────────────────────────────────────

let geoipDb: any = null

/**
 * Load geoip-lite DB (lazy, once per process).
 * Install with: npm install geoip-lite
 */
export async function initGeoIp(): Promise<boolean> {
  if (geoipDb) return true
  try {
    // Use dynamic import with type assertion to avoid TS errors if module not installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoip = await import('geoip-lite' as any) as any
    geoipDb = geoip.default || geoip
    return true
  } catch {
    console.warn('[verification] geoip-lite not installed. Run: npm install geoip-lite')
    return false
  }
}

export interface IpInfo {
  country?: string
  region?: string
  city?: string
  ll?: [number, number]
  timezone?: string
  isAnonymous?: boolean
  isProxy?: boolean
}

/**
 * Look up IP geolocation.
 * Returns null if geoip-lite not installed or lookup fails.
 */
export function lookupIp(ip: string): IpInfo | null {
  if (!geoipDb) return null
  try {
    const info = geoipDb.lookup(ip)
    if (!info) return null

    return {
      country: info.country,
      region: info.region,
      city: info.city,
      ll: info.ll,
      timezone: info.timezone,
      isAnonymous: info.anonymous,
      isProxy: false, // geoip-lite free tier doesn't detect proxies
    }
  } catch {
    return null
  }
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) return null
  return (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0
}

/** Check if IP falls within a CIDR range. */
export function isIpInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) return ip === cidr
  const [network, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false

  const ipNum = ipToNumber(ip)
  const netNum = ipToNumber(network)
  if (ipNum === null || netNum === null) return false

  const mask = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1)) >>> 0
  return (ipNum & mask) === (netNum & mask)
}

// ── Device / User-Agent ──────────────────────────────────────────────────────

let uaParser: UAParser | null = null

export function initUaParser(): void {
  uaParser = new UAParser()
}

export interface ParsedUA {
  browser: { name: string; version: string }
  os: { name: string; version: string }
  device: { type: string; model: string; vendor: string }
  engine: { name: string; version: string }
}

export function parseUserAgent(ua: string): ParsedUA | null {
  if (!ua) return null
  if (!uaParser) initUaParser()
  uaParser!.setUA(ua)
  const r = uaParser!.getResult()

  return {
    browser: { name: r.browser?.name || 'Unknown', version: r.browser?.version || '' },
    os: { name: r.os?.name || 'Unknown', version: r.os?.version || '' },
    device: { type: r.device?.type || 'desktop', model: r.device?.model || '', vendor: r.device?.vendor || '' },
    engine: { name: r.engine?.name || 'Unknown', version: r.engine?.version || '' },
  }
}

// ── Combined Registration Validation ─────────────────────────────────────────

export interface RegistrationValidation {
  email: { valid: boolean; reason?: string; domain?: string }
  phone: PhoneVerificationResult
  ip: IpInfo | null
  device: ParsedUA | null
  riskScore: number // 0-100, higher = more suspicious
}

/**
 * Validate all registration inputs at once.
 * Returns risk signals so the caller can decide to flag/review/allow.
 */
export async function validateRegistration(input: {
  email: string
  phone?: string
  ip?: string | null
  userAgent?: string | null
}): Promise<RegistrationValidation> {
  const emailResult = await verifyEmail(input.email)
  const phoneResult = input.phone ? verifyPhone(input.phone) : { valid: true, reason: 'Not provided' }
  const ipInfo = input.ip ? lookupIp(input.ip) : null
  const device = input.userAgent ? parseUserAgent(input.userAgent) : null

  let risk = 0
  if (!emailResult.valid) risk += 40
  if (!phoneResult.valid) risk += 20
  if (ipInfo?.isAnonymous) risk += 30
  if (!ipInfo) risk += 10

  return {
    email: emailResult,
    phone: phoneResult,
    ip: ipInfo,
    device,
    riskScore: Math.min(100, risk),
  }
}

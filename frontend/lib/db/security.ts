import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/sessions'
import { writeAuditLog } from '@/lib/db/misc'

// ─── Collections ────────────────────────────────────────────────────────────
// security_events      — any security-relevant occurrence (blocked IP, impossible travel,
//                        multi-account, new device, brute force, rate-limit)
// device_fingerprints  — one doc per fingerprint; tracks all user accounts seen on it
// security_blocklist   — IPs blocked by superadmin or auto-blocked

export type SecurityEventType =
  | 'auth.login'
  | 'auth.signup'
  | 'auth.failed_login'
  | 'auth.rate_limited'
  | 'auth.blocked_ip'
  | 'auth.new_device'
  | 'auth.impossible_travel'
  | 'auth.multi_account'
  | 'auth.blocked_fingerprint'
  | 'auth.captcha_failed'
  | 'admin.block_ip'
  | 'admin.unblock_ip'
  | 'auth.oauth_link_reset'
  | 'auth.email_change'
  | 'auth.ip_autoblock_skipped'

export interface SecurityEventDoc {
  id: string
  ts: string
  type: SecurityEventType
  severity: 'info' | 'warning' | 'critical'
  user_id?: string
  email?: string
  ip?: string
  visitorId?: string
  detail: string
  metadata?: Record<string, unknown>
}

export interface DeviceFingerprintDoc {
  visitorId: string
  first_seen: string
  last_seen: string
  seen_count: number
  /** Distinct user accounts that have logged in / signed up from this device. */
  accounts: { user_id: string; email: string; first_seen: string; last_seen: string }[]
  /** User agents observed from this device (for forensic review). */
  user_agents: string[]
  is_blocked: boolean
  blocked_at?: string
  blocked_reason?: string
}

/**
 * Check if an IP address matches any blocked entry, supporting CIDR notation.
 */
function ipToNumber(ip: string): number | null {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) return null
  return (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0
}

/** Check whether an IP matches a blocklist entry, supporting exact + CIDR. */
export function isIpInCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) {
    return ip === cidr
  }
  const [network, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false

  const ipNum = ipToNumber(ip)
  const netNum = ipToNumber(network)
  if (ipNum === null || netNum === null) return false

  const mask = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1)) >>> 0
  return (ipNum & mask) === (netNum & mask)
}

/** Look up whether an IP is currently blocked. */
export async function isIpBlocked(ip: string | null): Promise<boolean> {
  if (!ip) return false
  try {
    const db = await getMongoDb()
    const entries = await db.collection('security_blocklist').find({
      active: true,
      $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: nowIso() } }],
    }).toArray()

    return entries.some(entry => {
      const blockedIp = String(entry.ip)
      return isIpInCidr(ip, blockedIp)
    })
  } catch {
    return false
  }
}

export async function blockIp(params: {
  ip: string
  reason: string
  actor?: string
  expiresAt?: string
}): Promise<void> {
  try {
    const db = await getMongoDb()
    // ponytail: auto-blocks used to be permanent (expires_at null = blocked
    // forever, and isIpBlocked treats null as active). Default to 24h so a
    // false positive — e.g. a shared Cloudflare edge IP — self-heals.
    // Pass an explicit expiresAt for longer/manual blocks.
    const expiresAt = params.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await db.collection('security_blocklist').updateOne(
      { ip: params.ip },
      {
        $set: {
          ip: params.ip,
          reason: params.reason,
          active: true,
          expires_at: expiresAt,
          blocked_by: params.actor || 'system',
          blocked_at: nowIso(),
        },
        $setOnInsert: { created_at: nowIso() },
      },
      { upsert: true },
    )
    await writeAuditLog({
      action: 'security.block_ip',
      outcome: 'success',
      actor: params.actor || 'system',
      actorIp: params.ip,
      resource: 'ip/' + params.ip,
      resourceType: 'security',
      severity: 'critical',
      detail: params.reason,
      user_id: params.actor || 'system',
    })
  } catch (e) {
    console.error('[security] blockIp failed:', e)
  }
}

export async function unblockIp(ip: string, actor?: string): Promise<void> {
  try {
    const db = await getMongoDb()
    await db.collection('security_blocklist').updateOne(
      { ip },
      { $set: { active: false, unblocked_at: nowIso(), unblocked_by: actor || 'system' } },
    )
    await writeAuditLog({
      action: 'security.unblock_ip',
      outcome: 'success',
      actor: actor || 'system',
      actorIp: ip,
      resource: 'ip/' + ip,
      resourceType: 'security',
      severity: 'info',
      detail: 'IP unblocked',
      user_id: actor || 'system',
    })
  } catch (e) {
    console.error('[security] unblockIp failed:', e)
  }
}

/** Record a security event + audit log entry. Fire-and-forget friendly. */
export async function recordSecurityEvent(entry: Omit<SecurityEventDoc, 'id' | 'ts'>): Promise<void> {
  try {
    const db = await getMongoDb()
    await db.collection('security_events').insertOne({
      id: newId(),
      ts: nowIso(),
      ...entry,
    } as SecurityEventDoc)
    await writeAuditLog({
      action: entry.type,
      outcome: 'denied',
      actor: entry.email || entry.ip || 'unknown',
      actorIp: entry.ip || 'unknown',
      resource: entry.user_id ? 'user/' + entry.user_id : 'unknown',
      resourceType: 'security',
      severity: entry.severity,
      detail: entry.detail,
      user_id: entry.user_id || 'unknown',
    })
  } catch (e) {
    console.error('[security] recordSecurityEvent failed:', e)
  }
}

/**
 * Track a device fingerprint against a user account.
 * Returns flags the caller can use to trigger alerts/emails:
 *  - isNewDevice       → never seen for THIS user before
 *  - multiAccountRisk  → same fingerprint has been used by OTHER user accounts
 */
export async function trackDeviceFingerprint(params: {
  visitorId: string
  user_id: string
  email: string
  ip?: string
  user_agent?: string
}): Promise<{ isNewDevice: boolean; multiAccountRisk: boolean }> {
  const { visitorId, user_id, email, ip, user_agent } = params
  if (!visitorId) return { isNewDevice: false, multiAccountRisk: false }

  try {
    const db = await getMongoDb()
    const existing = await db.collection('device_fingerprints').findOne({ visitorId })

    const now = nowIso()
    const accountEntry = { user_id, email, first_seen: now, last_seen: now }

    if (!existing) {
      await db.collection('device_fingerprints').insertOne({
        visitorId,
        first_seen: now,
        last_seen: now,
        seen_count: 1,
        accounts: [accountEntry],
        user_agents: user_agent ? [user_agent] : [],
        is_blocked: false,
      } as DeviceFingerprintDoc)
      return { isNewDevice: true, multiAccountRisk: false }
    }

    const seenUser = existing.accounts.some((a: { user_id: string }) => a.user_id === user_id)
    const otherAccounts = existing.accounts.filter((a: { user_id: string }) => a.user_id !== user_id)
    const multiAccountRisk = otherAccounts.length > 0

    const update: Record<string, unknown> = {
      last_seen: now,
      seen_count: (existing.seen_count || 0) + 1,
    }
    if (user_agent && !(existing.user_agents || []).includes(user_agent)) {
      update.user_agents = [...(existing.user_agents || []), user_agent].slice(-20)
    }
    if (seenUser) {
      update.accounts = (existing.accounts || []).map((a: { user_id: string; last_seen: string }) =>
        a.user_id === user_id ? { ...a, last_seen: now } : a,
      )
    } else {
      update.accounts = [...(existing.accounts || []), accountEntry]
    }

    await db.collection('device_fingerprints').updateOne(
      { visitorId },
      { $set: update, $setOnInsert: { is_blocked: false } },
    )

    return { isNewDevice: !seenUser, multiAccountRisk }
  } catch (e) {
    console.error('[security] trackDeviceFingerprint failed:', e)
    return { isNewDevice: false, multiAccountRisk: false }
  }
}

/**
 * Impossible-travel detection: compare the current login location (IP) against the
 * most recent session for the same user. Flag when the geo origin differs wildly
 * within a short window (e.g. continents apart < 2h) — classic account-takeover signal.
 */
export async function detectImpossibleTravel(params: {
  user_id: string
  ip: string | null
  country: string | null
}): Promise<boolean> {
  const { user_id, ip, country } = params
  if (!ip || !country) return false
  try {
    const db = await getMongoDb()
    const prev = await db.collection('user_sessions')
      .find({ user_id, country: { $ne: null } })
      .sort({ created_at: -1 })
      .limit(1)
      .toArray()
    const last = prev[0]
    if (!last?.country || !last.created_at) return false

    // Only evaluate when both sides have a resolvable country and they differ.
    if (last.country === country) return false

    const lastTs = new Date(last.created_at).getTime()
    const now = Date.now()
    const hoursDiff = (now - lastTs) / 36e5
    // ponytail ceiling: 2h window heuristic. Upgrade path: real distance calc via lat/lon
    // (both sessions store lat/lon) + threshold (e.g. > 4000 km) instead of country name.
    return hoursDiff < 2
  } catch {
    return false
  }
}

// ─── security_settings enforcement helpers ──────────────────────────────────

export interface SecurityPolicy {
  ipWhitelistEnabled: boolean
  ipWhitelist: string[]
  deviceFingerprintEnabled: boolean
  impossibleTravelEnabled: boolean
  concurrentSessionLimit: number
  passwordPolicyEnabled: boolean
}

/** Read + cache the enabled toggles from security_settings. */
async function getSecurityPolicy(): Promise<SecurityPolicy> {
  const defaults: SecurityPolicy = {
    ipWhitelistEnabled: false,
    ipWhitelist: [],
    deviceFingerprintEnabled: true,
    impossibleTravelEnabled: true,
    concurrentSessionLimit: 0,
    passwordPolicyEnabled: true,
  }
  try {
    const db = await getMongoDb()
    const settings = await db.collection('security_settings').find({}).toArray()
    const get = (name: string) => settings.find(s => s.name === name)?.status === 'enabled'
    // IP Whitelist stores allowed ranges in a sibling doc under the same name.
    const whitelistDoc = await db.collection('security_settings').findOne({ name: 'IP Whitelist' })
    const raw = (whitelistDoc as any)?.allowed_ips
    defaults.ipWhitelistEnabled = get('IP Whitelist')
    defaults.ipWhitelist = Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === 'string') : []
    defaults.deviceFingerprintEnabled = get('Device Fingerprinting')
    defaults.impossibleTravelEnabled = get('Impossible Travel Detection')
    const conc = settings.find(s => s.name === 'Concurrent Session Limit')
    defaults.concurrentSessionLimit = Number((conc as any)?.limit) || 0
    defaults.passwordPolicyEnabled = get('Password Policy')
  } catch { /* defaults */ }
  return defaults
}

let _policyCache: SecurityPolicy | null = null
let _policyAt = 0

/** Cached security policy (60s TTL) so enforcement doesn't hit Mongo per request. */
export async function securityPolicy(): Promise<SecurityPolicy> {
  const now = Date.now()
  if (_policyCache && now - _policyAt < 60_000) return _policyCache
  const policy = await getSecurityPolicy()
  _policyCache = policy
  _policyAt = now
  return policy
}

export function invalidateSecurityPolicyCache() {
  _policyCache = null
  _policyAt = 0
}

/** True when an IP whitelist is enabled and this IP is NOT on it. */
export async function isIpOutsideWhitelist(ip: string | null): Promise<boolean> {
  if (!ip) return false
  const policy = await securityPolicy()
  if (!policy.ipWhitelistEnabled) return false
  return !policy.ipWhitelist.some(entry => {
    const e = entry.trim()
    if (!e) return false
    if (e === ip) return true
    if (e.includes('/')) return ipInCidr(ip, e)
    return false
  })
}

/** Minimal IPv4/IPv6 CIDR match. ponytail ceiling: IPv4 only; upgrade = use net package. */
function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/')
  const bits = parseInt(bitsStr || '32', 10)
  if (!range || Number.isNaN(bits)) return false
  const a = ipToInt(ip)
  const b = ipToInt(range)
  if (a === null || b === null) return false
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (a & mask) === (b & mask)
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return null
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

/**
 * Required 2FA for privileged roles (audit A-041).
 *
 * Superadmins and tenant admins must turn on an authenticator app when
 * Admin → Settings → Product & access → "Require 2FA for admins" is on
 * (default on). The grace period starts the first time we see the admin
 * without 2FA (`admin_2fa_grace_started_at` on the user). During the grace
 * period they get a banner-free nudge; after it, every signed-in page
 * (proxy page gate) sends them to /auth/two-factor-setup until it's on.
 * Sign-in itself is never blocked, so nobody is locked out.
 */
import type { GeneralPlatformSettings } from '@/lib/platform-general-settings'

export const ADMIN_2FA_SETUP_PATH = '/auth/two-factor-setup'

export function isPrivilegedRole(role: unknown): boolean {
  return role === 'superadmin' || role === 'tenant_admin'
}

export type Admin2faState =
  | { status: 'ok' }
  | { status: 'grace'; daysLeft: number }
  | { status: 'required' }

/** Pure. */
export function admin2faState(input: {
  role: unknown
  totpEnabled: boolean
  graceStartedAt: string | Date | null | undefined
  settings: Pick<GeneralPlatformSettings, 'enforce_admin_2fa' | 'admin_2fa_grace_days'>
  now?: number
}): Admin2faState {
  if (!input.settings.enforce_admin_2fa || !isPrivilegedRole(input.role) || input.totpEnabled) return { status: 'ok' }
  const now = input.now ?? Date.now()
  const parsed = input.graceStartedAt ? new Date(input.graceStartedAt).getTime() : NaN
  const started = Number.isFinite(parsed) ? parsed : now
  const graceMs = Math.max(0, input.settings.admin_2fa_grace_days) * 86_400_000
  const left = started + graceMs - now
  if (left <= 0) return { status: 'required' }
  return { status: 'grace', daysLeft: Math.max(1, Math.ceil(left / 86_400_000)) }
}

const TTL_MS = 20_000
const cache = new Map<string, { at: number; state: Admin2faState }>()

export function invalidateAdmin2faCache(userId?: string): void {
  if (userId) cache.delete(userId)
  else cache.clear()
}

/** State for a signed-in user (DB read, short cache). Starts the grace clock on first sight. */
export async function getAdmin2faState(userId: string, role: unknown): Promise<Admin2faState> {
  if (!isPrivilegedRole(role)) return { status: 'ok' }
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.state
  const [{ getMongoDb }, { getGeneralSettingsCached }] = await Promise.all([
    import('@/lib/mongodb'),
    import('@/lib/platform-general-settings-server'),
  ])
  const settings = await getGeneralSettingsCached()
  let state: Admin2faState = { status: 'ok' }
  if (settings.enforce_admin_2fa) {
    const db = await getMongoDb()
    const users = db.collection('user')
    const filter = { $or: [{ id: userId }, { _id: userId as never }] }
    const doc = await users.findOne(filter, { projection: { totp_enabled: 1, admin_2fa_grace_started_at: 1 } })
    let started = doc?.admin_2fa_grace_started_at as string | undefined
    if (doc && !doc.totp_enabled && !started) {
      started = new Date().toISOString()
      await users.updateOne({ _id: doc._id, admin_2fa_grace_started_at: { $exists: false } }, { $set: { admin_2fa_grace_started_at: started } }).catch(() => {})
    }
    state = admin2faState({ role, totpEnabled: doc?.totp_enabled === true, graceStartedAt: started, settings })
  }
  cache.set(userId, { at: Date.now(), state })
  if (cache.size > 5000) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
  return state
}

/**
 * Failed-sign-in throttle keyed on account + IP, with exponential back-off
 * (rules in lib/auth-account `loginBackoffMs`). Replaces the old "3 failures
 * from one IP ⇒ block the IP for 24h", which locked whole campuses behind a
 * NAT out of the site.
 *
 * Stored in Mongo `auth_throttle` (TTL index) so it holds across instances.
 */
import { getMongoDb } from '@/lib/mongodb'
import { loginBackoffMs } from '@/lib/auth-account'

const WINDOW_MS = 60 * 60_000
let _indexed = false

async function col() {
  const db = await getMongoDb()
  const c = db.collection<{ key: string; fails: number; locked_until: Date | null; expires_at: Date; updated_at: Date }>('auth_throttle')
  if (!_indexed) {
    _indexed = true
    await c.createIndex({ key: 1 }, { unique: true, name: 'auth_throttle_key' }).catch(() => {})
    await c.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'auth_throttle_ttl' }).catch(() => {})
  }
  return c
}

function keyOf(kind: string, account: string, ip: string) {
  return `${kind}:${account.toLowerCase().trim()}|${ip}`
}

/** Is this account+IP currently locked out? Fails open (the per-IP and per-email rate limits still apply). */
export async function checkAuthThrottle(kind: string, account: string, ip: string): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  try {
    const row = await (await col()).findOne({ key: keyOf(kind, account, ip) })
    const until = row?.locked_until ? new Date(row.locked_until).getTime() : 0
    if (until > Date.now()) return { ok: false, retryAfterSec: Math.ceil((until - Date.now()) / 1000) }
  } catch {
    // DB hiccup — rely on the coarser limits
  }
  return { ok: true }
}

/** Count a failure; returns the lock-out now in force (0 = none). */
export async function recordAuthFailure(kind: string, account: string, ip: string): Promise<number> {
  try {
    const c = await col()
    const now = new Date()
    const row = await c.findOneAndUpdate(
      { key: keyOf(kind, account, ip) },
      { $inc: { fails: 1 }, $set: { updated_at: now, expires_at: new Date(now.getTime() + WINDOW_MS) } },
      { upsert: true, returnDocument: 'after' },
    )
    const fails = row?.fails ?? 1
    const backoff = loginBackoffMs(fails)
    if (backoff > 0) {
      await c.updateOne({ key: keyOf(kind, account, ip) }, { $set: { locked_until: new Date(now.getTime() + backoff) } })
    }
    return backoff
  } catch {
    return 0
  }
}

export async function clearAuthFailures(kind: string, account: string, ip: string): Promise<void> {
  try {
    await (await col()).deleteOne({ key: keyOf(kind, account, ip) })
  } catch {
    // best effort
  }
}

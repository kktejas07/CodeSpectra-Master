/**
 * Monthly candidate-invite quota per tenant (W4-05 / W4-17).
 *
 * One counter document per tenant and month in `candidate_invite_quota`
 * (`_id: <tenant>:<month start>`). Invites are reserved with a conditional
 * `$inc` — `used + n <= limit` is checked and applied in a single atomic
 * update — so parallel bulk batches and single invited links can never push a
 * tenant past `max_candidate_invites_per_month`. The counter is seeded once
 * from the invites already created this month. When an insert fails after a
 * reservation, `releaseInviteQuota` gives the seats back.
 *
 * Shared by createBulkInvites and POST /api/exams/[id]/links (type=invited).
 */
import type { Db } from 'mongodb'

export const QUOTA_COLLECTION = 'candidate_invite_quota'

export type InviteQuotaResult =
  | { ok: true; reserved: number; key: string | null }
  | { ok: false; status: 402; code: 'plan_limit'; limit: number; remaining: number; error: string }

export function quotaKey(tenantId: string, windowStartIso: string): string {
  return `${tenantId}:${windowStartIso.slice(0, 7)}`
}

export function planLimitMessage(remaining: number, requested: number): string {
  return remaining === 0
    ? 'Your organisation has used all its candidate invites for this month. Upgrade your plan to invite more.'
    : `Your plan allows ${remaining} more candidate invite${remaining === 1 ? '' : 's'} this month — remove ${requested - remaining} or upgrade.`
}

/**
 * Atomically reserve `n` invites for `tenantId` against `limit` in the window
 * starting at `windowStartIso`. Infinite limit → always ok (nothing stored).
 */
export async function reserveInviteQuotaWithLimit(
  db: Db,
  tenantId: string,
  n: number,
  limit: number,
  windowStartIso: string,
): Promise<InviteQuotaResult> {
  if (!Number.isFinite(limit)) return { ok: true, reserved: n, key: null }
  const col = db.collection<{ _id: string; tenant_id: string; window_start: string; used: number; updated_at?: string }>(QUOTA_COLLECTION)
  const key = quotaKey(tenantId, windowStartIso)
  const existing = await col.findOne({ _id: key })
  if (!existing) {
    // Seed from invites already created this month (runs once per tenant+month).
    const used = await db.collection('candidate_invites').countDocuments({ tenant_id: tenantId, created_at: { $gte: windowStartIso } })
    try {
      await col.updateOne({ _id: key }, { $setOnInsert: { tenant_id: tenantId, window_start: windowStartIso, used } }, { upsert: true })
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e // seeded concurrently
    }
  }
  const r = await col.updateOne(
    { _id: key, $expr: { $lte: [{ $add: [{ $ifNull: ['$used', 0] }, n] }, limit] } },
    { $inc: { used: n }, $set: { updated_at: new Date().toISOString() } },
  )
  if (r.matchedCount === 1) return { ok: true, reserved: n, key }
  const now = await col.findOne({ _id: key })
  const remaining = Math.max(0, limit - Number(now?.used || 0))
  return { ok: false, status: 402, code: 'plan_limit', limit, remaining, error: planLimitMessage(remaining, n) }
}

/** Plan-aware wrapper: superadmins and tenant-less exams are not capped. */
export async function reserveInviteQuota(
  db: Db,
  p: { tenantId: string | null; actorRole: string; count: number },
): Promise<InviteQuotaResult> {
  if (p.actorRole === 'superadmin' || !p.tenantId || p.count <= 0) return { ok: true, reserved: 0, key: null }
  const { getTenantEntitlements, windowStart } = await import('@/lib/entitlements')
  const { limitFor } = await import('@/lib/entitlements-core')
  const ent = await getTenantEntitlements(p.tenantId)
  const limit = limitFor(ent.plan, 'max_candidate_invites_per_month')
  return reserveInviteQuotaWithLimit(db, p.tenantId, p.count, limit, windowStart('month'))
}

/** Give back seats reserved for invites that were not created. */
export async function releaseInviteQuota(db: Db, r: InviteQuotaResult, n?: number): Promise<void> {
  if (!r.ok || !r.key) return
  const give = Math.min(n ?? r.reserved, r.reserved)
  if (give <= 0) return
  await db.collection<{ _id: string }>(QUOTA_COLLECTION).updateOne({ _id: r.key }, { $inc: { used: -give } }).catch(() => {})
}

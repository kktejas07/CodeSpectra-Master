/**
 * The one entitlement resolver. Every plan check (AI credit allowance, scan /
 * challenge / seat / assessment limits, plan-gated features) goes through
 * here, so what a user paid for (`billing_subscriptions`) is what they get.
 *
 * Rules are in lib/entitlements-core.ts (pure, unit tested).
 */
import 'server-only'
import { ObjectId, type Filter } from 'mongodb'
import { billingSubscriptions, type BillingSubscriptionDoc } from '@/lib/db/billing'
import { users, tenants, type BetterAuthUserDoc } from '@/lib/db/admin'
import { getPlanForRole } from '@/lib/plans'
import type { PlanDefinition } from '@/lib/plans-client'
import type { APIUser } from '@/lib/route-auth'
import {
  featureEnabled,
  highestPlanKey,
  isSubscriptionLive,
  limitFor,
  mergePlanDefinition,
  pickEffectivePlanKey,
  withinLimit,
  type EntitlementSource,
  type LimitKey,
} from '@/lib/entitlements-core'

export interface Entitlements {
  planKey: string
  source: EntitlementSource
  plan: PlanDefinition
  subscription: BillingSubscriptionDoc | null
}

/** Filter matching a Better Auth user by `id` or `_id` (string or ObjectId). */
export function userIdFilter(id: string): Filter<BetterAuthUserDoc> {
  const or: Array<Record<string, unknown>> = [{ id }, { _id: id }]
  if (ObjectId.isValid(id)) or.push({ _id: new ObjectId(id) })
  return { $or: or } as Filter<BetterAuthUserDoc>
}

async function liveSubscription(userId: string): Promise<BillingSubscriptionDoc | null> {
  const subs = await billingSubscriptions()
  const sub = await subs.findOne({ user_id: userId, status: 'active' }, { sort: { ends_at: -1 }, projection: { _id: 0 } })
  return isSubscriptionLive(sub) ? (sub as BillingSubscriptionDoc) : null
}

async function planDefinition(key: string): Promise<PlanDefinition> {
  return mergePlanDefinition(key, await getPlanForRole(key))
}

export async function getUserEntitlements(userId: string): Promise<Entitlements> {
  const [sub, userDoc] = await Promise.all([
    liveSubscription(userId),
    users().then((c) => c.findOne(userIdFilter(userId), { projection: { plan: 1 } })),
  ])
  const { key, source } = pickEffectivePlanKey({ subscription: sub, userPlan: userDoc?.plan })
  return { planKey: key, source, plan: await planDefinition(key), subscription: sub }
}

/**
 * An organisation's plan: the tenant's admin-set `plan` label or the best
 * live subscription held by one of its tenant admins, whichever is higher.
 */
export async function getTenantEntitlements(tenantId: string): Promise<{ planKey: string; plan: PlanDefinition }> {
  const tenant = await (await tenants()).findOne({ id: tenantId }, { projection: { plan: 1 } })
  const admins = await (await users())
    .find({ $or: [{ tenantId }, { organizationId: tenantId }], role: 'tenant_admin' } as Filter<BetterAuthUserDoc>, {
      projection: { id: 1, _id: 1, plan: 1 },
    })
    .limit(50)
    .toArray()
  const adminIds = admins.map((a) => String(a.id || a._id))
  const subs = adminIds.length
    ? await (await billingSubscriptions())
        .find({ user_id: { $in: adminIds }, status: 'active', ends_at: { $gt: new Date().toISOString() } }, { projection: { plan_id: 1 } })
        .toArray()
    : []
  const key = highestPlanKey([tenant?.plan, ...admins.map((a) => a.plan), ...subs.map((s) => s.plan_id)])
  return { planKey: key, plan: await planDefinition(key) }
}

export type PlanGateError = { error: string; status: 402; code: 'plan_limit' | 'plan_feature'; limit?: number; plan: string }

/** Feature flag check on an already-resolved plan. Superadmins are never gated. */
export function checkFeature(user: Pick<APIUser, 'role'>, ent: { planKey: string; plan: PlanDefinition }, feature: string): PlanGateError | null {
  if (user.role === 'superadmin') return null
  if (featureEnabled(ent.plan, feature)) return null
  return {
    error: 'Your plan does not include this feature. Upgrade to use it.',
    status: 402,
    code: 'plan_feature',
    plan: ent.planKey,
  }
}

/**
 * Count limit check. `used` is the caller's current usage in the limit's
 * window; returns a 402 payload when `used + requested` would exceed it.
 */
export function checkLimit(
  user: Pick<APIUser, 'role'>,
  ent: { planKey: string; plan: PlanDefinition },
  key: LimitKey,
  used: number,
  requested = 1,
  message = 'You have reached your plan limit. Upgrade to continue.',
): PlanGateError | null {
  if (user.role === 'superadmin') return null
  const limit = limitFor(ent.plan, key)
  if (withinLimit(limit, used, requested)) return null
  return { error: message, status: 402, code: 'plan_limit', limit: Number.isFinite(limit) ? limit : undefined, plan: ent.planKey }
}

/** Start of the current UTC day / month as ISO strings (limit windows). */
export function windowStart(kind: 'day' | 'month', now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), kind === 'day' ? now.getUTCDate() : 1))
  return d.toISOString()
}

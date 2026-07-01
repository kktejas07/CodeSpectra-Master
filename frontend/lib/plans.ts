/**
 * Server-side plan functions (requires MongoDB).
 * Do NOT import from client components — use lib/plans-client.ts instead.
 *
 * Re-exports client-safe types from plans-client.ts for convenience.
 */

// Re-export client-safe functions and types
export {
  isFeatureEnabled, isPageAllowed, getFeatureLimit,
  getDefaultPlans,
  type PlanFeature, type PlanDefinition,
} from '@/lib/plans-client'

// In-memory plan cache
let _planCache: Map<string, import('@/lib/plans-client').PlanDefinition> | null = null
let _planCacheAt = 0

export async function getPlanForRole(plan: string): Promise<import('@/lib/plans-client').PlanDefinition | null> {
  const now = Date.now()
  if (_planCache && now - _planCacheAt < 300_000) {
    return _planCache.get(plan) || null
  }
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const plans = await db.collection('plans').find({}).toArray()
    _planCache = new Map()
    for (const p of plans) _planCache.set(p.plan, p as unknown as import('@/lib/plans-client').PlanDefinition)
    _planCacheAt = now
    return _planCache.get(plan) || null
  } catch {
    return null
  }
}

export function invalidatePlanCache() { _planCache = null; _planCacheAt = 0 }

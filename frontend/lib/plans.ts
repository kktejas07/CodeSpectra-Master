/**
 * Subscription plan system — integrated with role-based permissions.
 *
 * Plans define feature limits and page access for each subscription tier.
 * Combined with roles: user must have BOTH the right role AND the right plan
 * to access a feature.
 *
 * Stored in MongoDB `plans` collection.
 */

export interface PlanFeature {
  key: string
  label: string
  description: string
  enabled: boolean
  limit?: number // -1 = unlimited
  type: 'boolean' | 'count' | 'pages'
}

export interface PlanDefinition {
  _id?: string
  plan: string // 'free' | 'pro' | 'enterprise'
  name: string
  description: string
  price?: string
  features: PlanFeature[]
  isDefault?: boolean
  createdAt?: string
  updatedAt?: string
}

// ─── Default Plans ──────────────────────────────────────

const ALL_PAGES = [
  '/dashboard', '/dashboard/arena', '/dashboard/problems', '/dashboard/tracks',
  '/dashboard/scanner', '/dashboard/agent', '/dashboard/learning',
  '/dashboard/skill-analytics', '/dashboard/identity-verify',
  '/dashboard/leaderboard', '/dashboard/achievements', '/dashboard/certifications',
  '/dashboard/pricing', '/dashboard/challenges', '/dashboard/interviews',
  '/dashboard/prepare', '/dashboard/profile', '/dashboard/settings',
  '/dashboard/billing', '/dashboard/notifications', '/dashboard/support',
  '/dashboard/search', '/dashboard/id-card', '/dashboard/codeathons',
  '/dashboard/jobs', '/dashboard/exams', '/dashboard/resumes', '/dashboard/analytics',
  '/dashboard/notifications/preferences', '/dashboard/interviews/feedback',
]

const PRO_ONLY_PAGES = [
  '/dashboard/agent', '/dashboard/skill-analytics',
  '/dashboard/certifications', '/dashboard/codeathons',
]

const ENTERPRISE_ONLY_PAGES = [
  '/dashboard/interviews/feedback', '/dashboard/admin/team',
]

export function getDefaultPlans(): PlanDefinition[] {
  return [
    {
      plan: 'free',
      name: 'Free',
      description: 'Basic access to coding problems and scanner',
      features: [
        { key: 'max_scans_per_day', label: 'Scans per day', description: 'Maximum code scans per day', enabled: true, limit: 10, type: 'count' },
        { key: 'max_challenges', label: 'Challenges', description: 'Maximum challenges per month', enabled: true, limit: 5, type: 'count' },
        { key: 'piston_concurrent', label: 'Concurrent executions', description: 'Max parallel code executions', enabled: true, limit: 2, type: 'count' },
        { key: 'ai_features', label: 'AI Features', description: 'AI code review, hints, analysis', enabled: false, limit: 0, type: 'boolean' },
        { key: 'code_review', label: 'AI Code Review', description: 'AI-powered code review', enabled: false, limit: 0, type: 'boolean' },
        { key: 'certifications', label: 'Certifications', description: 'Official certifications', enabled: false, limit: 0, type: 'boolean' },
        { key: 'analytics', label: 'Advanced Analytics', description: 'Detailed performance analytics', enabled: false, limit: 0, type: 'boolean' },
        { key: 'allowed_pages', label: 'Accessible Pages', description: 'Pages available on this plan', enabled: true, limit: -1, type: 'pages' },
      ],
      isDefault: true,
    },
    {
      plan: 'pro',
      name: 'Pro',
      description: 'Full access to all coding features + AI',
      price: '$29/month',
      features: [
        { key: 'max_scans_per_day', label: 'Scans per day', description: 'Maximum code scans per day', enabled: true, limit: 100, type: 'count' },
        { key: 'max_challenges', label: 'Challenges', description: 'Maximum challenges per month', enabled: true, limit: 50, type: 'count' },
        { key: 'piston_concurrent', label: 'Concurrent executions', description: 'Max parallel code executions', enabled: true, limit: 10, type: 'count' },
        { key: 'ai_features', label: 'AI Features', description: 'AI code review, hints, analysis', enabled: true, limit: -1, type: 'boolean' },
        { key: 'code_review', label: 'AI Code Review', description: 'AI-powered code review', enabled: true, limit: -1, type: 'boolean' },
        { key: 'certifications', label: 'Certifications', description: 'Official certifications', enabled: true, limit: -1, type: 'boolean' },
        { key: 'analytics', label: 'Advanced Analytics', description: 'Detailed performance analytics', enabled: true, limit: -1, type: 'boolean' },
        { key: 'allowed_pages', label: 'Accessible Pages', description: 'Pages available on this plan', enabled: true, limit: -1, type: 'pages' },
      ],
    },
    {
      plan: 'enterprise',
      name: 'Enterprise',
      description: 'Everything + team management + priority support',
      price: '$99/month',
      features: [
        { key: 'max_scans_per_day', label: 'Scans per day', description: 'Maximum code scans per day', enabled: true, limit: -1, type: 'count' },
        { key: 'max_challenges', label: 'Challenges', description: 'Maximum challenges per month', enabled: true, limit: -1, type: 'count' },
        { key: 'piston_concurrent', label: 'Concurrent executions', description: 'Max parallel code executions', enabled: true, limit: 30, type: 'count' },
        { key: 'ai_features', label: 'AI Features', description: 'AI code review, hints, analysis', enabled: true, limit: -1, type: 'boolean' },
        { key: 'code_review', label: 'AI Code Review', description: 'AI-powered code review', enabled: true, limit: -1, type: 'boolean' },
        { key: 'certifications', label: 'Certifications', description: 'Official certifications', enabled: true, limit: -1, type: 'boolean' },
        { key: 'analytics', label: 'Advanced Analytics', description: 'Detailed performance analytics', enabled: true, limit: -1, type: 'boolean' },
        { key: 'team_management', label: 'Team Management', description: 'Manage organization team', enabled: true, limit: -1, type: 'boolean' },
        { key: 'priority_support', label: 'Priority Support', description: '24/7 priority support', enabled: true, limit: -1, type: 'boolean' },
        { key: 'allowed_pages', label: 'Accessible Pages', description: 'Pages available on this plan', enabled: true, limit: -1, type: 'pages' },
      ],
    },
  ]
}

// ─── Plan Checking ──────────────────────────────────────

let _planCache: Map<string, PlanDefinition> | null = null
let _planCacheAt = 0

export async function getPlanForRole(plan: string): Promise<PlanDefinition | null> {
  const now = Date.now()
  if (_planCache && now - _planCacheAt < 300_000) {
    return _planCache.get(plan) || null
  }
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const plans = await db.collection('plans').find({}).toArray()
    _planCache = new Map()
    for (const p of plans) _planCache.set(p.plan, p as unknown as PlanDefinition)
    _planCacheAt = now
    return _planCache.get(plan) || null
  } catch {
    return null
  }
}

export function invalidatePlanCache() { _planCache = null; _planCacheAt = 0 }

/**
 * Check if a specific feature is enabled for a plan.
 */
export function isFeatureEnabled(plan: PlanDefinition | null, featureKey: string): boolean {
  if (!plan) return false
  const feature = plan.features.find(f => f.key === featureKey)
  return feature?.enabled ?? false
}

/**
 * Check if a page is allowed for a plan.
 * Enterprise and Pro get all pages. Free gets limited pages.
 */
export function isPageAllowed(plan: PlanDefinition | null, page: string): boolean {
  if (!plan) return false
  if (plan.plan === 'enterprise') return true
  if (plan.plan === 'pro') return true
  if (plan.plan === 'free') {
    const excludedPages = [...PRO_ONLY_PAGES, ...ENTERPRISE_ONLY_PAGES]
    return !excludedPages.some(p => page === p || page.startsWith(p + '/'))
  }
  return true
}

/**
 * Get feature limit (returns -1 for unlimited).
 */
export function getFeatureLimit(plan: PlanDefinition | null, featureKey: string): number {
  if (!plan) return 0
  const feature = plan.features.find(f => f.key === featureKey)
  if (!feature || !feature.enabled) return 0
  return feature.limit ?? 0
}

/**
 * Combined check: user has role permission AND plan allows the feature.
 */
export function checkAccess(
  rolePermissions: string[],
  plan: PlanDefinition | null,
  page: string,
  feature?: string
): { allowed: boolean; reason?: string } {
  // Role check
  const hasRoleAccess = rolePermissions.some(r => page === r || page.startsWith(r + '/'))
  if (!hasRoleAccess) return { allowed: false, reason: 'Role does not permit access to this page' }

  // Plan check
  if (!plan) return { allowed: false, reason: 'No active plan' }
  if (!isPageAllowed(plan, page)) return { allowed: false, reason: `Plan '${plan.name}' does not include this page` }
  if (feature && !isFeatureEnabled(plan, feature)) return { allowed: false, reason: `Plan '${plan.name}' does not include feature '${feature}'` }

  return { allowed: true }
}

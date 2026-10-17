/**
 * Client-safe plan utility functions.
 * NO MongoDB imports. Safe to import from client components.
 */

export interface PlanFeature {
  key: string; label: string; description: string; enabled: boolean
  limit?: number; type: 'boolean' | 'count' | 'pages'
}

export interface PlanDefinition {
  _id?: string; plan: string; name: string; description: string
  price?: string; features: PlanFeature[]; isDefault?: boolean
  createdAt?: string; updatedAt?: string
}

/**
 * Check if a feature is enabled for a plan. Pure function, no DB.
 */
export function isFeatureEnabled(plan: PlanDefinition | null, featureKey: string): boolean {
  if (!plan) return false
  const feature = plan.features.find(f => f.key === featureKey)
  return feature?.enabled ?? false
}

/**
 * Check if a page is allowed for a given plan. Pure function, no DB.
 */
export function isPageAllowed(plan: PlanDefinition | null, page: string): boolean {
  if (!plan) return false

  // If the plan has explicit feature toggle for allowed_pages / accessible_pages that is disabled
  const allowedPagesFeature = plan.features.find(f => f.key === 'allowed_pages' || f.key === 'accessible_pages')
  if (allowedPagesFeature && !allowedPagesFeature.enabled) return false

  // Enterprise and Pro or custom paid tiers have full access to non-admin user dashboard routes
  if (plan.plan === 'enterprise' || plan.plan === 'pro') return true

  // For free plan or zero-cost default tiers, apply standard feature exclusions
  if (plan.plan === 'free' || plan.price === '$0' || plan.price === 'Free') {
    const excludedPatterns = [
      '/dashboard/admin', '/dashboard/agent', '/dashboard/skill-analytics',
      '/dashboard/certifications', '/dashboard/interviews/feedback',
      '/dashboard/codeathons', '/dashboard/jobs', '/dashboard/resumes',
    ]
    return !excludedPatterns.some(p => page === p || page.startsWith(p + '/'))
  }

  // Any other custom paid/configured plan defaults to allowed unless explicitly restricted
  return true
}

/**
 * Get feature limit. Returns Infinity for unlimited (-1 or 0).
 */
export function getFeatureLimit(plan: PlanDefinition | null, featureKey: string): number {
  if (!plan) return 0
  const feature = plan.features.find(f => f.key === featureKey)
  if (!feature || !feature.enabled) return 0
  if (feature.limit === -1 || feature.limit === 0) return Infinity
  return feature.limit ?? 0
}

/**
 * Format a limit value for display. -1 and 0 become "Unlimited".
 */
export function formatLimit(limit: number | undefined | null): string {
  if (limit === undefined || limit === null) return '0'
  if (limit === -1 || limit === 0) return 'Unlimited'
  return String(limit)
}

/** Default plans for seeding — pure data, no DB */
export function getDefaultPlans(): PlanDefinition[] {
  return [
    {
      plan: 'free', name: 'Free', description: 'Basic access to coding problems and scanner',
      features: [
        { key: 'max_scans_per_day', label: 'Scans per day', description: 'Maximum code scans allowed per day', enabled: true, limit: 10, type: 'count' },
        { key: 'max_challenges', label: 'Challenges per month', description: 'Maximum coding challenges per month', enabled: true, limit: 5, type: 'count' },
        { key: 'piston_concurrent', label: 'Concurrent executions', description: 'Max parallel code executions via Piston', enabled: true, limit: 2, type: 'count' },
        { key: 'ai_features', label: 'AI Features', description: 'AI code review, hints, and analysis', enabled: false, limit: 0, type: 'boolean' },
        { key: 'code_review', label: 'AI Code Review', description: 'AI-powered automated code review', enabled: false, limit: 0, type: 'boolean' },
        { key: 'certifications', label: 'Certifications', description: 'Official skill certifications', enabled: false, limit: 0, type: 'boolean' },
        { key: 'analytics', label: 'Advanced Analytics', description: 'Detailed performance and skill analytics', enabled: false, limit: 0, type: 'boolean' },
        { key: 'max_seats', label: 'Organisation seats', description: 'Members an organisation can have', enabled: true, limit: 5, type: 'count' },
        { key: 'max_assessments_per_month', label: 'Assessments per month', description: 'Assessments an organisation can create per month', enabled: true, limit: 3, type: 'count' },
        { key: 'ai_credits_per_month', label: 'AI credits per month', description: 'AI credits granted each month', enabled: true, limit: 10, type: 'count' },
        { key: 'allowed_pages', label: 'Accessible Pages', description: 'Dashboard pages available on this plan', enabled: true, limit: -1, type: 'pages' },
      ], isDefault: true,
    },
    {
      plan: 'pro', name: 'Pro', description: 'Full access to all coding features + AI', price: '$29/month',
      features: [
        { key: 'max_scans_per_day', label: 'Scans per day', description: 'Maximum code scans allowed per day', enabled: true, limit: 100, type: 'count' },
        { key: 'max_challenges', label: 'Challenges per month', description: 'Maximum coding challenges per month', enabled: true, limit: 50, type: 'count' },
        { key: 'piston_concurrent', label: 'Concurrent executions', description: 'Max parallel code executions via Piston', enabled: true, limit: 10, type: 'count' },
        { key: 'ai_features', label: 'AI Features', description: 'AI code review, hints, and analysis', enabled: true, limit: -1, type: 'boolean' },
        { key: 'code_review', label: 'AI Code Review', description: 'AI-powered automated code review', enabled: true, limit: -1, type: 'boolean' },
        { key: 'certifications', label: 'Certifications', description: 'Official skill certifications', enabled: true, limit: -1, type: 'boolean' },
        { key: 'analytics', label: 'Advanced Analytics', description: 'Detailed performance and skill analytics', enabled: true, limit: -1, type: 'boolean' },
        { key: 'max_seats', label: 'Organisation seats', description: 'Members an organisation can have', enabled: true, limit: 25, type: 'count' },
        { key: 'max_assessments_per_month', label: 'Assessments per month', description: 'Assessments an organisation can create per month', enabled: true, limit: 50, type: 'count' },
        { key: 'ai_credits_per_month', label: 'AI credits per month', description: 'AI credits granted each month', enabled: true, limit: 1000, type: 'count' },
        { key: 'allowed_pages', label: 'Accessible Pages', description: 'Dashboard pages available on this plan', enabled: true, limit: -1, type: 'pages' },
      ],
    },
    {
      plan: 'enterprise', name: 'Enterprise', description: 'Everything + team management', price: '$99/month',
      features: [
        { key: 'max_scans_per_day', label: 'Scans per day', description: 'Maximum code scans allowed per day', enabled: true, limit: -1, type: 'count' },
        { key: 'max_challenges', label: 'Challenges per month', description: 'Maximum coding challenges per month', enabled: true, limit: -1, type: 'count' },
        { key: 'piston_concurrent', label: 'Concurrent executions', description: 'Max parallel code executions via Piston', enabled: true, limit: 30, type: 'count' },
        { key: 'ai_features', label: 'AI Features', description: 'AI code review, hints, and analysis', enabled: true, limit: -1, type: 'boolean' },
        { key: 'code_review', label: 'AI Code Review', description: 'AI-powered automated code review', enabled: true, limit: -1, type: 'boolean' },
        { key: 'certifications', label: 'Certifications', description: 'Official skill certifications', enabled: true, limit: -1, type: 'boolean' },
        { key: 'analytics', label: 'Advanced Analytics', description: 'Detailed performance and skill analytics', enabled: true, limit: -1, type: 'boolean' },
        { key: 'team_management', label: 'Team Management', description: 'Manage organization team members', enabled: true, limit: -1, type: 'boolean' },
        { key: 'priority_support', label: 'Priority Support', description: '24/7 dedicated priority support', enabled: true, limit: -1, type: 'boolean' },
        { key: 'max_seats', label: 'Organisation seats', description: 'Members an organisation can have', enabled: true, limit: -1, type: 'count' },
        { key: 'max_assessments_per_month', label: 'Assessments per month', description: 'Assessments an organisation can create per month', enabled: true, limit: -1, type: 'count' },
        { key: 'ai_credits_per_month', label: 'AI credits per month', description: 'AI credits granted each month', enabled: true, limit: 5000, type: 'count' },
        { key: 'allowed_pages', label: 'Accessible Pages', description: 'Dashboard pages available on this plan', enabled: true, limit: -1, type: 'pages' },
      ],
    },
  ]
}

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
  if (plan.plan === 'enterprise') return true
  if (plan.plan === 'pro') return true
  if (plan.plan === 'free') {
    const excludedPatterns = [
      '/dashboard/admin', '/dashboard/agent', '/dashboard/skill-analytics',
      '/dashboard/certifications', '/dashboard/interviews/feedback',
      '/dashboard/codeathons', '/dashboard/jobs', '/dashboard/resumes',
    ]
    return !excludedPatterns.some(p => page === p || page.startsWith(p + '/'))
  }
  return true
}

/**
 * Get feature limit. Pure function, no DB.
 */
export function getFeatureLimit(plan: PlanDefinition | null, featureKey: string): number {
  if (!plan) return 0
  const feature = plan.features.find(f => f.key === featureKey)
  if (!feature || !feature.enabled) return 0
  return feature.limit ?? 0
}

/** Default plans for seeding — pure data, no DB */
export function getDefaultPlans(): PlanDefinition[] {
  return [
    {
      plan: 'free', name: 'Free', description: 'Basic access to coding problems and scanner',
      features: [
        { key: 'max_scans_per_day', label: 'Scans per day', description: '', enabled: true, limit: 10, type: 'count' },
        { key: 'max_challenges', label: 'Challenges', description: '', enabled: true, limit: 5, type: 'count' },
        { key: 'piston_concurrent', label: 'Concurrent executions', description: '', enabled: true, limit: 2, type: 'count' },
        { key: 'ai_features', label: 'AI Features', description: '', enabled: false, limit: 0, type: 'boolean' },
        { key: 'code_review', label: 'AI Code Review', description: '', enabled: false, limit: 0, type: 'boolean' },
        { key: 'certifications', label: 'Certifications', description: '', enabled: false, limit: 0, type: 'boolean' },
        { key: 'analytics', label: 'Advanced Analytics', description: '', enabled: false, limit: 0, type: 'boolean' },
        { key: 'allowed_pages', label: 'Accessible Pages', description: '', enabled: true, limit: -1, type: 'pages' },
      ], isDefault: true,
    },
    {
      plan: 'pro', name: 'Pro', description: 'Full access to all coding features + AI', price: '$29/month',
      features: [
        { key: 'max_scans_per_day', label: 'Scans per day', description: '', enabled: true, limit: 100, type: 'count' },
        { key: 'max_challenges', label: 'Challenges', description: '', enabled: true, limit: 50, type: 'count' },
        { key: 'piston_concurrent', label: 'Concurrent executions', description: '', enabled: true, limit: 10, type: 'count' },
        { key: 'ai_features', label: 'AI Features', description: '', enabled: true, limit: -1, type: 'boolean' },
        { key: 'code_review', label: 'AI Code Review', description: '', enabled: true, limit: -1, type: 'boolean' },
        { key: 'certifications', label: 'Certifications', description: '', enabled: true, limit: -1, type: 'boolean' },
        { key: 'analytics', label: 'Advanced Analytics', description: '', enabled: true, limit: -1, type: 'boolean' },
        { key: 'allowed_pages', label: 'Accessible Pages', description: '', enabled: true, limit: -1, type: 'pages' },
      ],
    },
    {
      plan: 'enterprise', name: 'Enterprise', description: 'Everything + team management', price: '$99/month',
      features: [
        { key: 'max_scans_per_day', label: 'Scans per day', description: '', enabled: true, limit: -1, type: 'count' },
        { key: 'max_challenges', label: 'Challenges', description: '', enabled: true, limit: -1, type: 'count' },
        { key: 'piston_concurrent', label: 'Concurrent executions', description: '', enabled: true, limit: 30, type: 'count' },
        { key: 'ai_features', label: 'AI Features', description: '', enabled: true, limit: -1, type: 'boolean' },
        { key: 'code_review', label: 'AI Code Review', description: '', enabled: true, limit: -1, type: 'boolean' },
        { key: 'certifications', label: 'Certifications', description: '', enabled: true, limit: -1, type: 'boolean' },
        { key: 'analytics', label: 'Advanced Analytics', description: '', enabled: true, limit: -1, type: 'boolean' },
        { key: 'team_management', label: 'Team Management', description: '', enabled: true, limit: -1, type: 'boolean' },
        { key: 'priority_support', label: 'Priority Support', description: '', enabled: true, limit: -1, type: 'boolean' },
        { key: 'allowed_pages', label: 'Accessible Pages', description: '', enabled: true, limit: -1, type: 'pages' },
      ],
    },
  ]
}

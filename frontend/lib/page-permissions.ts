/**
 * Dynamic Page Permission Registry
 *
 * Single source of truth for route → role mapping. Each dashboard page
 * registers itself here. New pages are auto-discovered from the filesystem
 * and default to 'user' access (can be overridden).
 *
 * To add a new page: just create page.tsx under app/dashboard/ - it will
 * appear here automatically with default 'user' role. Override by adding
 * an entry to ADMIN_ONLY_ROUTES or TENANT_ADMIN_ROUTES below.
 */

import type { UserRole } from '@/lib/rbac'

export interface PagePermission {
  route: string
  label: string
  requiredRole: UserRole
  category: 'platform' | 'organization' | 'user' | 'public'
}

/**
 * Routes that require superadmin access.
 * Everything under /dashboard/admin/ is superadmin by default.
 */
export const ADMIN_ONLY_ROUTES: string[] = [
  '/dashboard/admin',
  '/dashboard/admin/users',
  '/dashboard/admin/roles',
  '/dashboard/admin/analytics',
  '/dashboard/admin/audit-logs',
  '/dashboard/admin/integrations',
  '/dashboard/admin/pricing',
  '/dashboard/admin/security',
  '/dashboard/admin/proctor',
  '/dashboard/admin/rag',
  '/dashboard/admin/ai-inventory',
  '/dashboard/admin/system',
  '/dashboard/admin/permissions',
  '/dashboard/admin/plans',
  '/dashboard/admin/settings/llm',
  '/dashboard/admin/settings/mobile',
  '/dashboard/admin/teams',
  '/dashboard/admin/jobs',
  '/dashboard/admin/resumes',
  '/dashboard/admin/codeathons',
  '/dashboard/admin/exams',
  '/dashboard/admin/speed-insights',
  '/dashboard/admin/cdn',
  '/dashboard/admin/settings',
  '/dashboard/admin/workflows',
  '/dashboard/admin/question-generator',
]

/**
 * Routes accessible to tenant_admin and above.
 */
export const TENANT_ADMIN_ROUTES: string[] = [
  '/dashboard/admin/team',
  '/dashboard/interviews/feedback',
  '/dashboard/admin/hackathons/create',
  '/dashboard/admin/hackathons/edit',
]

/**
 * Routes accessible to all authenticated users (user, tenant_admin, superadmin).
 * Everything else under /dashboard/ defaults to 'user' unless specified above.
 */
export const ALL_USER_ROUTES: string[] = [
  '/dashboard',
  '/dashboard/arena',
  '/dashboard/problems',
  '/dashboard/tracks',
  '/dashboard/scanner',
  '/dashboard/agent',
  '/dashboard/learning',
  '/dashboard/skill-analytics',
  '/dashboard/identity-verify',
  '/dashboard/leaderboard',
  '/dashboard/achievements',
  '/dashboard/certifications',
  '/dashboard/pricing',
  '/dashboard/challenges',
  '/dashboard/interviews',
  '/dashboard/interview-prep',
  '/dashboard/prepare',
  '/dashboard/profile',
  '/dashboard/settings',
  '/dashboard/settings/ai',
  '/dashboard/billing',
  '/dashboard/notifications',
  '/dashboard/support',
  '/dashboard/status',
  '/dashboard/search',
  '/dashboard/id-card',
  '/dashboard/analytics',
  '/dashboard/100-days',
  '/dashboard/hackathons',
  '/dashboard/admin/hackathons',
  '/dashboard/codeathons',
  '/dashboard/jobs',
  '/dashboard/exams',
  '/dashboard/resumes',
  '/dashboard/judge',
]

/**
 * Get the required role for a given route.
 */
export function getRequiredRoleForRoute(pathname: string): UserRole {
  const base = pathname.split('?')[0]

  // Tenant admin routes (check first so /dashboard/admin/team matches before /dashboard/admin catch-all)
  for (const route of TENANT_ADMIN_ROUTES) {
    if (base === route || base.startsWith(route + '/')) return 'tenant_admin'
  }

  // Admin routes → superadmin
  for (const route of ADMIN_ONLY_ROUTES) {
    if (base === route || base.startsWith(route + '/')) return 'superadmin'
  }

  // All authenticated user routes
  for (const route of ALL_USER_ROUTES) {
    if (base === route || base.startsWith(route + '/')) return 'user'
  }

  // Default: any /dashboard/* route requires at least user auth
  if (base.startsWith('/dashboard/')) return 'user'

  return 'user'
}

/**
 * Human-readable labels for all known routes.
 */
export const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/admin': 'Admin Overview',
  '/dashboard/admin/system': 'Operations Overview',
  '/dashboard/admin/proctor': 'Proctor Management',
  '/dashboard/admin/users': 'Users Management',
  '/dashboard/admin/roles': 'User Assignments',
  '/dashboard/admin/analytics': 'Insights',
  '/dashboard/admin/audit-logs': 'Audit Logs',
  '/dashboard/admin/integrations': 'Integrations',
  '/dashboard/admin/pricing': 'Pricing Management',
  '/dashboard/admin/security': 'Security',
  '/dashboard/admin/settings': 'Platform Settings',
  '/dashboard/admin/settings/cloudflare': 'Cloudflare',
  '/dashboard/admin/settings/llm': 'LLM Configuration',
  '/dashboard/admin/settings/mobile': 'Mobile App',
  '/dashboard/admin/teams': 'Teams',
  '/dashboard/admin/jobs': 'Jobs Management',
  '/dashboard/admin/resumes': 'Resumes Management',
  '/dashboard/admin/codeathons': 'Codeathons Management',
  '/dashboard/admin/exams': 'Exams Management',
  '/dashboard/admin/speed-insights': 'Speed Insights',
  '/dashboard/admin/cdn': 'CDN & Edge',
  '/dashboard/admin/workflows': 'Workflows',
  '/dashboard/admin/question-generator': 'Question Generator',
  '/dashboard/admin/hackathons/create': 'Create Hackathon',
  '/dashboard/admin/hackathons/edit': 'Edit Hackathon',
  '/dashboard/admin/hackathons': 'Manage Hackathons',
  '/dashboard/admin/rag': 'RAG & Embeddings',
  '/dashboard/admin/ai-inventory': 'AI Inventory',
  '/dashboard/admin/permissions': 'Role & Permissions',
  '/dashboard/admin/plans': 'Subscription Plans',
  '/dashboard/admin/team': 'Organization',
  '/dashboard/admin/team/activity': 'Team Activity',
  '/dashboard/arena': 'Arena',
  '/dashboard/problems': 'Problems',
  '/dashboard/tracks': 'Tracks',
  '/dashboard/scanner': 'Scanner',
  '/dashboard/agent': 'Agent',
  '/dashboard/learning': 'Learning',
  '/dashboard/skill-analytics': 'Skill Analytics',
  '/dashboard/identity-verify': 'Identity Verify',
  '/dashboard/leaderboard': 'Leaderboard',
  '/dashboard/achievements': 'Achievements',
  '/dashboard/certifications': 'Certifications',
  '/dashboard/pricing': 'Pricing',
  '/dashboard/challenges': 'Challenges',
  '/dashboard/interviews': 'Interviews',
  '/dashboard/interview-prep': 'Interview Prep',
  '/dashboard/interviews/feedback': 'Interview Feedback',
  '/dashboard/interviews/results': 'Interview Results',
  '/dashboard/prepare': 'Prepare',
  '/dashboard/profile': 'Profile',
  '/dashboard/settings': 'Settings',
  '/dashboard/settings/ai': 'AI Settings',
  '/dashboard/billing': 'Billing',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/notifications/preferences': 'Notification Preferences',
  '/dashboard/support': 'Support',
  '/dashboard/search': 'Search',
  '/dashboard/id-card': 'ID Card',
  '/dashboard/hackathons': 'Events & Hackathons',
  '/dashboard/codeathons': 'Codeathons',
  '/dashboard/jobs': 'Jobs',
  '/dashboard/exams': 'Exams',
  '/dashboard/resumes': 'Resumes',
  '/dashboard/100-days': '100 Days of Code',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/judge': 'Judge Dashboard',
}

/**
 * Build the complete permission matrix for display.
 */
export function buildPermissionMatrix(): PagePermission[] {
  const matrix: PagePermission[] = []

  for (const route of ADMIN_ONLY_ROUTES) {
    matrix.push({
      route,
      label: ROUTE_LABELS[route] || route,
      requiredRole: 'superadmin',
      category: 'platform',
    })
  }

  for (const route of TENANT_ADMIN_ROUTES) {
    if (!ADMIN_ONLY_ROUTES.includes(route)) {
      matrix.push({
        route,
        label: ROUTE_LABELS[route] || route,
        requiredRole: 'tenant_admin',
        category: 'organization',
      })
    }
  }

  for (const route of ALL_USER_ROUTES) {
    if (!ADMIN_ONLY_ROUTES.includes(route) && !TENANT_ADMIN_ROUTES.includes(route)) {
      matrix.push({
        route,
        label: ROUTE_LABELS[route] || route,
        requiredRole: 'user',
        category: 'user',
      })
    }
  }

  return matrix.sort((a, b) => a.route.localeCompare(b.route))
}

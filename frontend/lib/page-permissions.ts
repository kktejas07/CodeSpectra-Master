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

import type { UserRole } from '@/lib/types/rbac-types'

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
  // System & Core
  '/dashboard/admin',
  '/dashboard/admin/system',
  '/dashboard/admin/analytics',
  '/dashboard/admin/users',
  '/dashboard/admin/roles',
  '/dashboard/admin/teams',
  '/dashboard/admin/organizations',
  '/dashboard/admin/permissions',
  '/dashboard/admin/security',

  // Hackathons, Problems & Proctoring
  '/dashboard/admin/hackathons',
  '/dashboard/admin/hackathons/create',
  '/dashboard/admin/hackathons/edit',
  '/dashboard/admin/codeathons',
  '/dashboard/admin/question-bank',
  '/dashboard/admin/assessments',
  '/dashboard/admin/proctor',
  '/dashboard/admin/certificates',

  // Billing & Plans
  '/dashboard/admin/pricing',
  '/dashboard/admin/plans',
  '/dashboard/admin/coupons',

  // Hiring & ATS
  '/dashboard/admin/jobs',
  '/dashboard/admin/resumes',
  '/dashboard/admin/predictive-validity',

  // KYC & Verification
  '/dashboard/admin/kyc',

  // AI & Generation Tools
  '/dashboard/admin/rag',
  '/dashboard/admin/ai-inventory',
  '/dashboard/admin/question-generator',
  '/dashboard/admin/workflows',

  // Analytics (superadmin only)
  '/dashboard/admin/analytics/proctoring',
  '/dashboard/admin/analytics/scores',

  // Infrastructure, Settings & Announcements
  '/dashboard/admin/settings',
  '/dashboard/admin/settings/cloudflare',
  '/dashboard/admin/settings/mobile',
  '/dashboard/admin/integrations',
  '/dashboard/admin/cdn',
  '/dashboard/admin/speed-insights',
  '/dashboard/admin/announcements',
  '/dashboard/admin/newsletter',
  '/dashboard/admin/billing',
  '/dashboard/admin/help',
  '/dashboard/admin/sso',
]

export const ADMIN_SECTIONS: { label: string; firstRoute: string }[] = [
  { label: 'System', firstRoute: '/dashboard/admin/system' },
  { label: 'Hackathons', firstRoute: '/dashboard/admin/hackathons' },
  { label: 'Billing', firstRoute: '/dashboard/admin/pricing' },
  { label: 'Hiring', firstRoute: '/dashboard/admin/jobs' },
  { label: 'AI Tools', firstRoute: '/dashboard/admin/rag' },
  { label: 'Infrastructure', firstRoute: '/dashboard/admin/settings' },
  { label: 'Organization', firstRoute: '/dashboard/admin/team' },
]

export const USER_SECTIONS: { label: string; firstRoute: string }[] = [
  { label: 'Dashboard', firstRoute: '/dashboard' },
  { label: 'Practice', firstRoute: '/dashboard/arena' },
  { label: 'Events', firstRoute: '/dashboard/codeathons' },
  { label: 'Learning', firstRoute: '/dashboard/learning' },
  { label: 'Career', firstRoute: '/dashboard/jobs' },
  { label: 'Tools', firstRoute: '/dashboard/scanner' },
  { label: 'Stats', firstRoute: '/dashboard/leaderboard' },
  { label: 'Account', firstRoute: '/dashboard/profile' },
  { label: 'Help', firstRoute: '/dashboard/support' },
]

/**
 * Routes accessible to tenant_admin and above.
 */
export const TENANT_ADMIN_ROUTES: string[] = [
  '/dashboard/admin/team',
  '/dashboard/admin/assessments',
  '/dashboard/interviews/feedback',
  '/dashboard/recruiter-analytics',
  '/dashboard/admin/hiring-manager-report',
  '/dashboard/admin/sme-review',
  '/dashboard/admin/requisitions',
]

/**
 * Routes accessible to judge role only.
 * Judges evaluate code submissions and review assessments.
 */
export const JUDGE_ROUTES: string[] = [
  '/dashboard/judge',
]

/**
 * Routes accessible to all authenticated users (user, tenant_admin, superadmin).
 * Everything else under /dashboard/ defaults to 'user' unless specified above.
 */
export const ALL_USER_ROUTES: string[] = [
  // Dashboard & AI
  '/dashboard',
  '/dashboard/agent',

  // Practice & Coding
  '/dashboard/arena',
  '/dashboard/problems',
  '/dashboard/challenges',
  '/dashboard/tracks',
  '/dashboard/100-days',

  // Events & Competitions
  '/dashboard/codeathons',
  '/dashboard/hackathons',
  
  // Learning & Prep
  '/dashboard/learning',
  '/dashboard/interview-prep',
  
  // Career & Hiring
  '/dashboard/jobs',
  '/dashboard/interviews',
  '/dashboard/resumes',
  '/dashboard/assessments',
'/dashboard/certifications',

  // Tools
  '/dashboard/scanner',
  '/dashboard/cad',
  '/dashboard/identity-verify',

  // Stats & Progress
  '/dashboard/leaderboard',
  '/dashboard/achievements',
  '/dashboard/analytics',
  '/dashboard/skill-analytics',

  // User & Account
  '/dashboard/profile',
  '/dashboard/notifications',
  '/dashboard/billing',
  '/dashboard/pricing',
  '/dashboard/settings',
  '/dashboard/settings/ai',

  // Referrals
  '/dashboard/referrals',

  // Misc
  '/dashboard/support',
  '/dashboard/status',
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

  // Judge routes
  for (const route of JUDGE_ROUTES) {
    if (base === route || base.startsWith(route + '/')) return 'judge'
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
  '/dashboard/admin/system': 'Operations',
  '/dashboard/admin/proctor': 'Proctor',
  '/dashboard/admin/certificates': 'Certificates',
  '/dashboard/admin/users': 'Users',
  '/dashboard/admin/roles': 'Roles',
  '/dashboard/admin/organizations': 'Organizations',
  '/dashboard/admin/analytics': 'Insights',
  '/dashboard/admin/analytics/proctoring': 'Proctoring Analytics',
  '/dashboard/admin/analytics/scores': 'Score Analytics',
  '/dashboard/admin/integrations': 'Integrations',
  '/dashboard/admin/pricing': 'Pricing',
  '/dashboard/admin/security': 'Security',
  '/dashboard/admin/security/email-monitoring': 'Email Monitoring',
  '/dashboard/admin/settings': 'Platform Settings',
  '/dashboard/admin/settings/cloudflare': 'Cloudflare',
  '/dashboard/admin/settings/mobile': 'Mobile App',
  '/dashboard/admin/settings/kyc': 'KYC Providers',
  '/dashboard/admin/jobs': 'Jobs',
  '/dashboard/admin/resumes': 'Resumes',
  '/dashboard/admin/codeathons': 'Codeathons',
  '/dashboard/admin/coupons': 'Coupons',
  '/dashboard/admin/assessments': 'Assessments',
  '/dashboard/admin/speed-insights': 'Speed Insights',
  '/dashboard/admin/cdn': 'CDN & Edge',
  '/dashboard/admin/workflows': 'Workflows',
  '/dashboard/admin/question-generator': 'Question Generator',
  '/dashboard/admin/hackathons/create': 'Create Hackathon',
  '/dashboard/admin/hackathons/edit': 'Edit Hackathon',
  '/dashboard/admin/hackathons': 'Hackathons',
  '/dashboard/admin/announcements': 'Announcements',
  '/dashboard/admin/newsletter': 'Newsletter',
  '/dashboard/admin/rag': 'RAG',
  '/dashboard/admin/ai-inventory': 'AI Inventory',
  '/dashboard/admin/permissions': 'Permissions',
  '/dashboard/admin/plans': 'Plans & Pricing',
  '/dashboard/admin/team': 'Team',
  '/dashboard/admin/teams': 'Tenant Teams',
  '/dashboard/admin/team/activity': 'Team Activity',
  '/dashboard/admin/kyc': 'KYC Verification',
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
  '/dashboard/recruiter-analytics': 'Recruiter Analytics',
  '/dashboard/profile': 'Profile',
  '/dashboard/settings': 'Settings',
  '/dashboard/settings/ai': 'AI Settings',
  '/dashboard/billing': 'Billing',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/notifications/preferences': 'Notification Preferences',
  '/dashboard/support': 'Support',
  '/dashboard/referrals': 'Referrals',
  '/dashboard/status': 'System Status',
  '/dashboard/hackathons': 'Hackathons',
  '/dashboard/codeathons': 'Codeathons',
  '/dashboard/jobs': 'Jobs',
  '/dashboard/assessments': 'Assessments',
  '/dashboard/resumes': 'Resumes',
  '/dashboard/100-days': '100 Days',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/judge': 'Judge Dashboard',
  '/dashboard/cad': 'CAD Editor',
  '/dashboard/admin/billing': 'Billing Admin',
  '/dashboard/admin/help': 'Help Center',
  '/dashboard/admin/sso': 'SSO Config',
  '/dashboard/admin/question-bank': 'Question Bank',
  '/dashboard/admin/requisitions': 'Requisitions',
  '/dashboard/admin/hiring-manager-report': 'Hiring Report',
  '/dashboard/admin/predictive-validity': 'Predictive Validity',
  '/dashboard/admin/sme-review': 'SME Review',
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

  for (const route of JUDGE_ROUTES) {
    if (!ADMIN_ONLY_ROUTES.includes(route) && !TENANT_ADMIN_ROUTES.includes(route) && !ALL_USER_ROUTES.includes(route)) {
      matrix.push({
        route,
        label: ROUTE_LABELS[route] || route,
        requiredRole: 'judge',
        category: 'user',
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

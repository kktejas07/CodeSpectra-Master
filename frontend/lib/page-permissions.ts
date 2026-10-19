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
import { resolveRouteAccess } from '@/lib/page-access-map'

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
  '/dashboard/admin/security/email-monitoring',
  '/dashboard/admin/security/scans',
  '/dashboard/admin/feedback',

  // Hackathons, Problems & Proctoring (hackathon/codeathon admin is in EVENT_ADMIN_ROUTES)
  '/dashboard/admin/question-bank',
  // '/dashboard/admin/assessments/bulk' is open to company admins (CORE-009): the API scopes them to their tests.
  '/dashboard/admin/assessments/pipeline',
  '/dashboard/admin/proctor',
  '/dashboard/admin/certificates',

  // Billing & Plans
  '/dashboard/admin/pricing',
  '/dashboard/admin/plans',
  '/dashboard/admin/coupons',

  // Hiring & ATS
  '/dashboard/admin/jobs',
  '/dashboard/admin/resumes',

  // KYC & Verification
  '/dashboard/admin/kyc',

  // AI & Generation Tools
  '/dashboard/admin/rag',
  '/dashboard/admin/ai-inventory',
  '/dashboard/admin/question-generator',
  '/dashboard/admin/courses',
  '/dashboard/admin/courses/[id]',
  '/dashboard/admin/cron-jobs',
  '/dashboard/admin/automations',

  // Infrastructure, Settings & Announcements
  '/dashboard/admin/settings',
  '/dashboard/admin/settings/cloudflare',
  '/dashboard/admin/settings/kyc',
  '/dashboard/admin/integrations',
  '/dashboard/admin/cdn',
  '/dashboard/admin/speed-insights',
  '/dashboard/admin/announcements',
  '/dashboard/admin/newsletter',
  '/dashboard/admin/events-feed',
  '/dashboard/admin/content-studio',
  '/dashboard/admin/blog',
  '/dashboard/admin/learn',
  '/dashboard/admin/signals',
  '/dashboard/admin/resources',
  '/dashboard/admin/billing',
  '/dashboard/admin/marketplace',
  '/dashboard/admin/help',
  '/dashboard/admin/sso',
]

export const ADMIN_SECTIONS: { label: string; firstRoute: string }[] = [
  { label: 'System', firstRoute: '/dashboard/admin/system' },
  { label: 'Hackathons', firstRoute: '/dashboard/admin/hackathons' },
  { label: 'Billing', firstRoute: '/dashboard/admin/pricing' },
  { label: 'Hiring', firstRoute: '/dashboard/admin/jobs' },
  { label: 'AI Tools', firstRoute: '/dashboard/admin/rag' },
  { label: 'Learning Admin', firstRoute: '/dashboard/admin/courses' },
  { label: 'Infrastructure', firstRoute: '/dashboard/admin/settings' },
  { label: 'Organization', firstRoute: '/dashboard/admin/team' },
]

export const USER_SECTIONS: { label: string; firstRoute: string }[] = [
  { label: 'Dashboard', firstRoute: '/dashboard' },
  { label: 'Practice', firstRoute: '/dashboard/arena' },
  { label: 'Events', firstRoute: '/dashboard/events' },
  { label: 'Courses', firstRoute: '/dashboard/courses' },
  { label: 'Discover', firstRoute: '/dashboard/quizzes' },
  { label: 'My activity', firstRoute: '/dashboard/courses/my' },
  { label: 'Career', firstRoute: '/dashboard/jobs' },
  { label: 'Tools', firstRoute: '/dashboard/scanner' },
  { label: 'Stats', firstRoute: '/dashboard/leaderboard' },
  { label: 'Account', firstRoute: '/dashboard/profile' },
  { label: 'Agent', firstRoute: '/dashboard/agent' },
  { label: 'Help', firstRoute: '/dashboard/support' },
]

/**
 * Hackathon + codeathon admin. Company admins (tenant_admin) manage their own
 * organization's events here (every API scopes them to their tenant);
 * superadmin keeps the global view with an organization filter. Sub-pages
 * ([id], report, edit/[id]) match by prefix.
 */
export const EVENT_ADMIN_ROUTES: string[] = [
  '/dashboard/admin/hackathons',
  '/dashboard/admin/hackathons/create',
  '/dashboard/admin/hackathons/edit',
  '/dashboard/admin/codeathons',
]

/**
 * Routes accessible to tenant_admin and above.
 */
export const TENANT_ADMIN_ROUTES: string[] = [
  ...EVENT_ADMIN_ROUTES,
  '/dashboard/admin/team',
  '/dashboard/admin/team/activity',
  '/dashboard/admin/assessments',
  '/dashboard/interviews/feedback',
  '/dashboard/recruiter-analytics',
  '/dashboard/admin/hiring-manager-report',
  // Hiring analytics: /api/admin/predictive-validity scopes tenant admins to their own tests.
  '/dashboard/admin/predictive-validity',
  '/dashboard/admin/sme-review',
  // Admin AI copilot: every /api/admin/agent route scopes tenant admins to their organisation.
  '/dashboard/admin/agent',
  // Knowledge sources for the copilot: /api/admin/knowledge scopes tenant admins to their organisation.
  '/dashboard/admin/knowledge',
  // Workflow builder: /api/workflows scopes tenant admins to their organisation's workflows.
  '/dashboard/admin/workflows',
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
  // Dashboard & Overview (FIRST)
  '/dashboard',

  // Practice & Coding
  '/dashboard/arena',
  '/dashboard/problems',
  '/dashboard/challenges',
  '/dashboard/tracks',
  '/dashboard/100-days',

  // Events & Competitions
  '/dashboard/events',
  '/dashboard/events/[id]',
  '/dashboard/codeathons',
  '/dashboard/hackathons',
  
  // Learning & Prep
  '/dashboard/courses',
  '/dashboard/courses/my',
  '/dashboard/courses/wishlist',
  '/dashboard/interview-prep',

  // Discover (Unstop-style hubs)
  '/dashboard/quizzes',
  '/dashboard/articles',
  '/dashboard/resources',

  // My Activity
  '/dashboard/activity/recent',
  '/dashboard/activity/sessions',
  '/dashboard/activity/bookmarks',
  
  // Career & Hiring
  '/dashboard/jobs',
  '/dashboard/interviews',
  '/dashboard/interviews/ai-mock',
  '/dashboard/interviews/ai-mock/setup',
  '/dashboard/mock-tests',
  '/dashboard/mock-tests/history',
  '/dashboard/resumes',
  '/dashboard/assessments',
  '/dashboard/assessments/ai-fluency',
  '/dashboard/assessments/ai-fluency/setup',
  '/dashboard/certifications',

  // Hiring pipeline (ATS). Open to any signed-in role here because interviewers
  // and clients are ordinary users; membership + ATS role are enforced server-side
  // (app/dashboard/hiring/layout.tsx and requireAts in every /api/ats route).
  '/dashboard/hiring',
  '/dashboard/hiring/jobs',
  '/dashboard/hiring/jobs/[id]',
  '/dashboard/hiring/candidates',
  '/dashboard/hiring/candidates/[id]',
  '/dashboard/hiring/approvals',
  '/dashboard/hiring/interviews',
  '/dashboard/hiring/analytics',
  '/dashboard/hiring/team',
  '/dashboard/hiring/clients',
  '/dashboard/hiring/settings',
  '/dashboard/hiring/client',
  '/dashboard/hiring/client/jobs/[id]',

  // Tools
  '/dashboard/scanner',
  '/dashboard/cad',
  '/dashboard/identity-verify',

  // Stats & Progress
  '/dashboard/leaderboard',
  '/dashboard/achievements',
  '/dashboard/skill-analytics',

  // User & Account
  '/dashboard/profile',
  '/dashboard/notifications',
  '/dashboard/calendar',
  '/dashboard/billing',
  '/dashboard/pricing',
  '/dashboard/settings',
  '/dashboard/settings/ai',

  // Referrals
  '/dashboard/referrals',

  // Marketplace buyer orders (APIs scope every read to the buyer)
  '/dashboard/orders',
  '/dashboard/orders/[id]',

  // Marketplace seller area (any signed-in user can apply; APIs require an approved seller)
  '/dashboard/seller',
  '/dashboard/seller/apply',

  // Agent (LAST)
  '/dashboard/agent',

  // Company Prep (public)
  '/companies',

  // Misc / Help
  '/dashboard/support',
]

/**
 * Get the required (sidebar-audience) role for a given route — resolved from
 * the one route → access map (lib/page-access-map.ts), most specific entry wins.
 */
export function getRequiredRoleForRoute(pathname: string): UserRole {
  return resolveRouteAccess(pathname.split('?')[0])?.navRole ?? 'user'
}

/** Platform-operator console. DB grants must not open these for non-superadmins. */
export function isPlatformAdminRoute(pathname: string): boolean {
  const base = pathname.split('?')[0]
  if (!(base === '/dashboard/admin' || base.startsWith('/dashboard/admin/'))) return false
  for (const route of TENANT_ADMIN_ROUTES) {
    if (base === route || base.startsWith(route + '/')) return false
  }
  return true
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
  '/dashboard/admin/integrations': 'Integrations',
  '/dashboard/admin/pricing': 'Pricing',
  '/dashboard/admin/security': 'Security',
  '/dashboard/admin/feedback': 'Feedback & Reports',
  '/dashboard/admin/security/email-monitoring': 'Email Monitoring',
  '/dashboard/admin/security/scans': 'Security Scans',
  '/dashboard/admin/settings': 'Platform Settings',
  '/dashboard/admin/settings/cloudflare': 'Cloudflare',
  '/dashboard/admin/settings/kyc': 'KYC Providers',
  '/dashboard/admin/jobs': 'Jobs',
  '/dashboard/admin/resumes': 'Resumes',
  '/dashboard/admin/codeathons': 'Codeathons',
  '/dashboard/admin/coupons': 'Coupons',
  '/dashboard/admin/assessments': 'Assessments',
  '/dashboard/admin/assessments/bulk': 'Invite candidates',
  '/dashboard/admin/assessments/pipeline': 'Pipeline',
  '/dashboard/admin/speed-insights': 'Speed Insights',
  '/dashboard/admin/cdn': 'CDN & Edge',
  '/dashboard/admin/workflows': 'Workflows',
  '/dashboard/admin/cron-jobs': 'Cron Jobs',
  '/dashboard/admin/automations': 'Automations',
  '/dashboard/admin/question-generator': 'Question Generator',
  '/dashboard/admin/courses': 'Course Management',
  '/dashboard/admin/courses/[id]': 'Edit Course',
  '/dashboard/admin/hackathons/create': 'Create Hackathon',
  '/dashboard/admin/hackathons/edit': 'Edit Hackathon',
  '/dashboard/admin/hackathons': 'Hackathons',
  '/dashboard/admin/announcements': 'Announcements',
  '/dashboard/admin/newsletter': 'Newsletter',
  '/dashboard/admin/events-feed': 'Events feed',
  '/dashboard/admin/content-studio': 'Content Studio',
  '/dashboard/admin/blog': 'Blog',
  '/dashboard/admin/learn': 'Learn hub',
  '/dashboard/admin/signals': 'Signals',
  '/dashboard/admin/resources': 'Resources / Ebooks',
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
  '/dashboard/courses': 'Courses',
  '/dashboard/courses/my': 'My Courses',
  '/dashboard/courses/wishlist': 'Watchlist',
  '/dashboard/quizzes': 'Quizzes',
  '/dashboard/articles': 'Articles',
  '/dashboard/resources': 'Resources',
  '/dashboard/activity/recent': 'Recently Viewed',
  '/dashboard/activity/sessions': 'My Sessions',
  '/dashboard/activity/bookmarks': 'Bookmarked Questions',
  '/dashboard/skill-analytics': 'Skill Analytics',
  '/dashboard/identity-verify': 'Identity Verify',
  '/dashboard/leaderboard': 'Leaderboard',
  '/dashboard/achievements': 'Achievements',
  '/dashboard/certifications': 'Certifications',
  '/dashboard/pricing': 'Pricing',
  '/dashboard/challenges': 'Challenges',
  '/dashboard/interviews': 'Interviews',
  '/dashboard/interviews/ai-mock': 'AI Mock Interview',
  '/dashboard/interviews/ai-mock/setup': 'AI Mock Setup',
  '/dashboard/mock-tests': 'Mock Tests',
  '/dashboard/mock-tests/history': 'Mock Test History',
  '/dashboard/interview-prep': 'Interview Prep',
  '/dashboard/interviews/feedback': 'Interview Feedback',
  '/dashboard/interviews/results': 'Interview Results',
  '/dashboard/recruiter-analytics': 'Recruiter Analytics',
  '/dashboard/profile': 'Profile',
  '/dashboard/settings': 'Settings',
  '/dashboard/settings/ai': 'AI Settings',
  '/dashboard/billing': 'Billing',
  '/dashboard/orders': 'My orders',
  '/dashboard/orders/[id]': 'Order',
  '/dashboard/seller': 'Seller dashboard',
  '/dashboard/seller/apply': 'Sell on CodeSpectra',
  '/dashboard/admin/marketplace': 'Marketplace',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/notifications/preferences': 'Notification Preferences',
  '/dashboard/support': 'Support',
  '/dashboard/referrals': 'Referrals',
  '/dashboard/hackathons': 'Hackathons',
  '/dashboard/codeathons': 'Codeathons',
  '/dashboard/events': 'Events',
  '/dashboard/jobs': 'Jobs',
  '/dashboard/assessments': 'Assessments',
  '/dashboard/assessments/ai-fluency': 'AI Fluency',
  '/dashboard/assessments/ai-fluency/setup': 'AI Fluency Setup',
  '/dashboard/resumes': 'Resumes',
  '/dashboard/100-days': '100 Days',
  '/dashboard/judge': 'Judge Dashboard',
  '/dashboard/cad': 'CAD Editor',
  '/dashboard/admin/billing': 'Billing Admin',
  '/dashboard/admin/help': 'Help Center',
  '/dashboard/admin/sso': 'SSO Config',
  '/dashboard/admin/question-bank': 'Question Bank',
  '/dashboard/admin/hiring-manager-report': 'Hiring Report',
  '/dashboard/admin/predictive-validity': 'Predictive Validity',
  '/dashboard/admin/sme-review': 'SME Review',
  '/dashboard/admin/agent': 'AI copilot',
  '/dashboard/admin/knowledge': 'Knowledge',
  '/dashboard/hiring': 'Hiring',
  '/dashboard/hiring/jobs': 'Hiring jobs',
  '/dashboard/hiring/jobs/[id]': 'Job pipeline',
  '/dashboard/hiring/candidates': 'Candidates',
  '/dashboard/hiring/candidates/[id]': 'Candidate',
  '/dashboard/hiring/approvals': 'Approvals',
  '/dashboard/hiring/interviews': 'My interviews',
  '/dashboard/hiring/analytics': 'Hiring analytics',
  '/dashboard/hiring/team': 'Hiring team',
  '/dashboard/hiring/clients': 'Clients',
  '/dashboard/hiring/settings': 'Hiring settings',
  '/dashboard/hiring/client': 'Client portal',
  '/dashboard/hiring/client/jobs/[id]': 'Client review',
  '/companies': 'Companies',
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

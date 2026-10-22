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
  '/dashboard/admin/talent',

  // KYC & Verification
  '/dashboard/admin/kyc',

  // AI & Generation Tools
  '/dashboard/admin/rag',
  '/dashboard/admin/ai-inventory',
  '/dashboard/admin/question-generator',
  '/dashboard/admin/question-bot',
  '/dashboard/admin/interview-sim',
  '/dashboard/admin/company-patterns',
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
  '/dashboard/admin/sso',
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
  '/dashboard/admin/mentors',
  '/dashboard/admin/pro-certs',
  '/dashboard/admin/study-plans',
  '/dashboard/admin/leagues',
  '/dashboard/admin/help',
]

export const ADMIN_SECTIONS: { label: string; firstRoute: string }[] = [
  { label: 'System', firstRoute: '/dashboard/admin/system' },
  { label: 'Hackathons', firstRoute: '/dashboard/admin/hackathons' },
  // /dashboard/admin/pricing only redirects to Plans and has no sidebar link, so the section starts at Plans.
  { label: 'Billing', firstRoute: '/dashboard/admin/plans' },
  { label: 'Hiring', firstRoute: '/dashboard/admin/jobs' },
  { label: 'AI tools', firstRoute: '/dashboard/admin/rag' },
  { label: 'Learning', firstRoute: '/dashboard/admin/courses' },
  { label: 'Automation', firstRoute: '/dashboard/admin/cron-jobs' },
  { label: 'Infrastructure', firstRoute: '/dashboard/admin/settings' },
  { label: 'Content', firstRoute: '/dashboard/admin/announcements' },
  { label: 'Commerce and help', firstRoute: '/dashboard/admin/billing' },
  { label: 'Organization', firstRoute: '/dashboard/admin/team' },
]

export const USER_SECTIONS: { label: string; firstRoute: string }[] = [
  { label: 'Dashboard', firstRoute: '/dashboard' },
  { label: 'Practice', firstRoute: '/dashboard/arena' },
  { label: 'Events', firstRoute: '/dashboard/events' },
  { label: 'Courses', firstRoute: '/dashboard/courses' },
  { label: 'Discover', firstRoute: '/dashboard/articles' },
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
  // Hosted contests (lib/contests): /api/contests* scope company admins to their organisation.
  '/dashboard/admin/contests',
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
  // College / company licences: /api/licences* scopes tenant admins to their own organisation.
  '/dashboard/admin/licences',
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
  // Personalised study plan (APIs scope every read/write to the signed-in learner)
  '/dashboard/study-plan',
  '/dashboard/study-plan/practice/[id]',

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

  // Discover (Unstop-style hubs). /dashboard/quizzes redirects to company tests (not in the nav).
  '/dashboard/quizzes',
  '/dashboard/articles',
  '/dashboard/resources',

  // My Activity
  '/dashboard/activity/recent',
  '/dashboard/activity/sessions',
  '/dashboard/activity/bookmarks',
  
  // Career & Hiring
  '/dashboard/jobs',
  '/dashboard/jobs/for-you',
  // Live hiring drives: candidates (/drives) and organisers / invigilators (/live-drives);
  // /api/live-drives* checks roster, organiser (campus / ATS role) or invigilator server-side.
  '/dashboard/drives',
  '/dashboard/drives/[id]',
  '/dashboard/live-drives',
  '/dashboard/live-drives/[id]',
  // Campus placement: /api/campus* checks college membership / placement-team role server-side.
  '/dashboard/campus',
  '/dashboard/placement',
  '/dashboard/placement/drives/[id]',
  '/dashboard/interviews',
  '/dashboard/interviews/ai-mock',
  '/dashboard/interviews/ai-mock/setup',
  '/dashboard/interview-sim',
  '/dashboard/interview-sim/[sessionId]',
  '/dashboard/mock-tests',
  '/dashboard/mock-tests/history',
  '/dashboard/company-tests',
  '/dashboard/company-tests/[patternId]',
  '/dashboard/resumes',
  '/dashboard/assessments',
  '/dashboard/assessments/ai-fluency',
  '/dashboard/assessments/ai-fluency/setup',
  '/dashboard/certifications',
  '/dashboard/certifications/proctored',
  '/dashboard/certifications/proctored/[slug]',
  '/dashboard/passport',

  // Hiring pipeline (ATS). Open to any signed-in role here because interviewers
  // and clients are ordinary users; membership + ATS role are enforced server-side
  // (app/dashboard/hiring/layout.tsx and requireAts in every /api/ats route).
  '/dashboard/hiring',
  '/dashboard/hiring/jobs',
  '/dashboard/hiring/jobs/[id]',
  '/dashboard/hiring/jobs/[id]/matches',
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
  '/dashboard/hiring/talent',

  // Tools
  '/dashboard/scanner',
  '/dashboard/cad',
  '/dashboard/identity-verify',

  // Stats & Progress
  '/dashboard/leaderboard',
  '/dashboard/leagues',
  '/dashboard/achievements',
  '/dashboard/skill-analytics',

  // User & Account
  '/dashboard/profile',
  '/dashboard/notifications',
  '/dashboard/calendar',
  '/dashboard/billing',
  '/dashboard/pricing',
  '/dashboard/checkout',
  '/dashboard/settings',
  '/dashboard/settings/ai',
  '/dashboard/settings/accessibility',
  '/dashboard/settings/whatsapp-practice',
  '/dashboard/settings/guardians',

  // Referrals
  '/dashboard/referrals',

  // Marketplace buyer orders (APIs scope every read to the buyer)
  '/dashboard/orders',
  '/dashboard/orders/[id]',

  // Marketplace seller area (any signed-in user can apply; APIs require an approved seller)
  '/dashboard/seller',
  '/dashboard/seller/apply',

  // Mentoring (any signed-in user; APIs check the mentor / the booking's learner or mentor)
  '/dashboard/mentor',
  '/dashboard/sessions/[id]',

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
  '/dashboard/admin': 'Admin overview',
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
  '/dashboard/admin/feedback': 'Feedback & reports',
  '/dashboard/admin/security/email-monitoring': 'Email monitoring',
  '/dashboard/admin/security/scans': 'Security scans',
  '/dashboard/admin/settings': 'Platform settings',
  '/dashboard/admin/settings/cloudflare': 'Cloudflare',
  '/dashboard/admin/settings/kyc': 'KYC providers',
  '/dashboard/admin/jobs': 'Jobs',
  '/dashboard/admin/resumes': 'Resumes',
  '/dashboard/admin/codeathons': 'Codeathons',
  '/dashboard/admin/contests': 'Contests',
  '/dashboard/admin/coupons': 'Coupons',
  '/dashboard/admin/assessments': 'Assessments',
  '/dashboard/admin/assessments/bulk': 'Invite candidates',
  '/dashboard/admin/assessments/pipeline': 'Pipeline',
  '/dashboard/admin/speed-insights': 'Speed insights',
  '/dashboard/admin/cdn': 'CDN & edge',
  '/dashboard/admin/workflows': 'Workflows',
  '/dashboard/admin/cron-jobs': 'Cron jobs',
  '/dashboard/admin/automations': 'Automations',
  '/dashboard/admin/question-generator': 'Question generator',
  '/dashboard/admin/question-bot': 'Question bot',
  '/dashboard/admin/interview-sim': 'Mock interviews',
  '/dashboard/admin/company-patterns': 'Company patterns',
  '/dashboard/admin/courses': 'Course management',
  '/dashboard/admin/courses/[id]': 'Edit course',
  '/dashboard/admin/hackathons/create': 'Create hackathon',
  '/dashboard/admin/hackathons/edit': 'Edit hackathon',
  '/dashboard/admin/hackathons': 'Hackathons',
  '/dashboard/admin/announcements': 'Announcements',
  '/dashboard/admin/newsletter': 'Newsletter',
  '/dashboard/admin/events-feed': 'Events feed',
  '/dashboard/admin/content-studio': 'Content studio',
  '/dashboard/admin/blog': 'Blog',
  '/dashboard/admin/learn': 'Learn hub',
  '/dashboard/admin/signals': 'Signals',
  '/dashboard/admin/resources': 'Resources and ebooks',
  '/dashboard/admin/rag': 'RAG',
  '/dashboard/admin/ai-inventory': 'AI inventory',
  '/dashboard/admin/permissions': 'Permissions',
  '/dashboard/admin/plans': 'Plans & pricing',
  '/dashboard/admin/team': 'Team',
  '/dashboard/admin/teams': 'Tenant teams',
  '/dashboard/admin/team/activity': 'Team activity',
  '/dashboard/admin/kyc': 'KYC verification',
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
  '/dashboard/leagues': 'Leagues',
  '/dashboard/campus': 'Campus',
  '/dashboard/placement': 'Placement console',
  '/dashboard/placement/drives/[id]': 'Placement drive',
  '/dashboard/drives': 'Hiring drives',
  '/dashboard/drives/[id]': 'Hiring drive',
  '/dashboard/live-drives': 'Live drives',
  '/dashboard/live-drives/[id]': 'Live drive control room',
  '/dashboard/admin/leagues': 'Leagues',
  '/dashboard/achievements': 'Achievements',
  '/dashboard/certifications': 'Certifications',
  '/dashboard/certifications/proctored': 'Proctored certifications',
  '/dashboard/certifications/proctored/[slug]': 'Certification',
  '/dashboard/passport': 'Skill passport',
  '/dashboard/pricing': 'Pricing',
  '/dashboard/checkout': 'Checkout',
  '/dashboard/challenges': 'Challenges',
  '/dashboard/interviews': 'Interviews',
  '/dashboard/interviews/ai-mock': 'AI Mock Interview',
  '/dashboard/interviews/ai-mock/setup': 'AI Mock Setup',
  '/dashboard/interview-sim': 'Mock interview',
  '/dashboard/interview-sim/[sessionId]': 'Mock interview session',
  '/dashboard/mock-tests': 'Mock Tests',
  '/dashboard/mock-tests/history': 'Mock Test History',
  '/dashboard/company-tests': 'Company tests',
  '/dashboard/company-tests/[patternId]': 'Company practice test',
  '/dashboard/interview-prep': 'Interview Prep',
  '/dashboard/interviews/feedback': 'Interview Feedback',
  '/dashboard/interviews/results': 'Interview Results',
  '/dashboard/recruiter-analytics': 'Recruiter analytics',
  '/dashboard/profile': 'Profile',
  '/dashboard/settings': 'Settings',
  '/dashboard/settings/ai': 'AI Settings',
  '/dashboard/settings/accessibility': 'Accessibility',
  '/dashboard/settings/whatsapp-practice': 'WhatsApp practice',
  '/dashboard/settings/guardians': 'Parent reports',
  '/dashboard/billing': 'Billing',
  '/dashboard/orders': 'My orders',
  '/dashboard/orders/[id]': 'Order',
  '/dashboard/seller': 'Seller dashboard',
  '/dashboard/seller/apply': 'Sell on CodeSpectra',
  '/dashboard/admin/marketplace': 'Marketplace',
  '/dashboard/admin/mentors': 'Mentors',
  '/dashboard/admin/pro-certs': 'Certifications (proctored)',
  '/dashboard/admin/study-plans': 'Study plans',
  '/dashboard/study-plan': 'Study plan',
  '/dashboard/study-plan/practice/[id]': 'Practice set',
  '/dashboard/mentor': 'Mentoring',
  '/dashboard/sessions/[id]': 'Mentoring session',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/notifications/preferences': 'Notification Preferences',
  '/dashboard/support': 'Support',
  '/dashboard/referrals': 'Referrals',
  '/dashboard/hackathons': 'Hackathons',
  '/dashboard/codeathons': 'Codeathons',
  '/dashboard/events': 'Events',
  '/dashboard/jobs': 'Jobs',
  '/dashboard/jobs/for-you': 'Jobs for you',
  '/dashboard/assessments': 'Assessments',
  '/dashboard/assessments/ai-fluency': 'AI Fluency',
  '/dashboard/assessments/ai-fluency/setup': 'AI Fluency Setup',
  '/dashboard/resumes': 'Resumes',
  '/dashboard/100-days': '100 Days',
  '/dashboard/judge': 'Judge Dashboard',
  '/dashboard/cad': 'CAD Editor',
  '/dashboard/admin/billing': 'Billing admin',
  '/dashboard/admin/licences': 'Licences',
  '/dashboard/admin/help': 'Help center',
  '/dashboard/admin/sso': 'SSO config',
  '/dashboard/admin/question-bank': 'Question bank',
  '/dashboard/admin/hiring-manager-report': 'Hiring report',
  '/dashboard/admin/predictive-validity': 'Predictive validity',
  '/dashboard/admin/sme-review': 'SME review',
  '/dashboard/admin/agent': 'AI copilot',
  '/dashboard/admin/knowledge': 'Knowledge',
  '/dashboard/hiring': 'Hiring',
  '/dashboard/hiring/jobs': 'Hiring jobs',
  '/dashboard/hiring/jobs/[id]': 'Job pipeline',
  '/dashboard/hiring/jobs/[id]/matches': 'Best matches',
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
  '/dashboard/hiring/talent': 'Talent search',
  '/dashboard/admin/talent': 'Talent search',
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

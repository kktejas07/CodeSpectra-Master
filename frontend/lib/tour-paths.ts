/**
 * Dashboard pathname → tour / guide id. Plain module (no 'use client') so
 * server code — the knowledge index (lib/rag/sources/guide.ts) — can read it too.
 */
/**
 * Single source of truth mapping a dashboard pathname → tour id.
 * The header Guide button and the per-page tour effects must agree,
 * otherwise Guide replays the wrong tour (or nothing at all).
 */
export const TOUR_ID_FOR_PATHS: Record<string, string> = {
  '/dashboard': 'welcome',
  '/dashboard/scanner': 'scanner',
  '/dashboard/problems': 'problems',
  '/dashboard/arena': 'arena',
  '/dashboard/courses': 'courses',
  '/dashboard/events': 'events',
  '/dashboard/interviews': 'interviews',
  '/dashboard/leaderboard': 'leaderboard',
  '/dashboard/achievements': 'achievements',
  '/dashboard/assessments': 'assessments',
  '/dashboard/tracks': 'tracks',
  '/dashboard/hackathons': 'hackathons',
  '/dashboard/articles': 'articles',
  '/dashboard/codeathons': 'codeathons',
  '/dashboard/settings': 'settings',
  '/dashboard/activity/recent': 'recent',
  '/dashboard/admin/system': 'admin-system',
  // ponytail: explicit per-page entries so every admin route shows its own
  // guide; the '/dashboard/admin' catch-all below covers future pages.
  // Longer exact entries (like admin/system above) still win by longest-match.
  '/dashboard/admin': 'admin',
  '/dashboard/admin/feedback': 'feedback',
  '/dashboard/admin/ai-inventory': 'admin-ai-inventory',
  '/dashboard/admin/analytics': 'admin-analytics',
  '/dashboard/admin/announcements': 'admin-announcements',
  '/dashboard/admin/assessments': 'admin-assessments',
  '/dashboard/admin/assessments/[id]': 'admin-assessment-results',
  '/dashboard/admin/assessments/[id]/edit': 'admin-assessments-edit',
  '/dashboard/admin/assessments/[id]/results': 'admin-assessment-results',
  '/dashboard/admin/assessments/bulk': 'admin-assessments-bulk',
  '/dashboard/admin/assessments/pipeline': 'admin-assessments-pipeline',
  '/dashboard/admin/billing': 'admin-billing',
  '/dashboard/admin/blog': 'admin-blog',
  '/dashboard/admin/cdn': 'admin-cdn',
  '/dashboard/admin/certificates': 'admin-certificates',
  '/dashboard/admin/codeathons': 'admin-codeathons',
  '/dashboard/admin/content-studio': 'admin-content-studio',
  '/dashboard/admin/coupons': 'admin-coupons',
  '/dashboard/admin/courses': 'admin-courses',
  '/dashboard/admin/courses/[id]': 'admin-course-detail',
  '/dashboard/admin/cron-jobs': 'admin-cron-jobs',
  '/dashboard/admin/hackathons': 'admin-hackathons',
  '/dashboard/admin/hackathons/[id]': 'admin-hackathon-detail',
  '/dashboard/admin/hackathons/[id]/report': 'admin-hackathon-report',
  '/dashboard/admin/hackathons/create': 'admin-hackathon-create',
  '/dashboard/admin/hackathons/edit/[id]': 'admin-hackathon-edit',
  '/dashboard/admin/help': 'admin-help',
  '/dashboard/admin/hiring-manager-report': 'admin-hiring-report',
  '/dashboard/admin/integrations': 'admin-integrations',
  '/dashboard/admin/jobs': 'admin-jobs',
  '/dashboard/admin/kyc': 'admin-kyc',
  '/dashboard/admin/newsletter': 'admin-newsletter',
  '/dashboard/admin/organizations': 'admin-organizations',
  '/dashboard/admin/permissions': 'admin-permissions',
  '/dashboard/admin/plans': 'admin-plans',
  '/dashboard/admin/predictive-validity': 'admin-predictive',
  '/dashboard/admin/pricing': 'admin-plans',
  '/dashboard/admin/proctor': 'admin-proctor',
  '/dashboard/admin/question-bank': 'admin-question-bank',
  '/dashboard/admin/question-generator': 'admin-question-generator',
  '/dashboard/admin/rag': 'admin-rag',
  '/dashboard/admin/resources': 'admin-resources',
  '/dashboard/admin/resumes': 'admin-resumes',
  '/dashboard/admin/roles': 'admin-roles',
  '/dashboard/admin/security': 'admin-security',
  '/dashboard/admin/security/email-monitoring': 'admin-email-monitoring',
  '/dashboard/admin/settings': 'admin-settings',
  '/dashboard/admin/settings/cloudflare': 'admin-settings',
  '/dashboard/admin/settings/kyc': 'admin-settings',
  '/dashboard/admin/signals': 'admin-signals',
  '/dashboard/admin/sme-review': 'admin-sme-review',
  '/dashboard/admin/speed-insights': 'admin-speed-insights',
  '/dashboard/admin/sso': 'admin-sso',
  '/dashboard/admin/team': 'admin-team',
  '/dashboard/admin/team/activity': 'admin-team-activity',
  '/dashboard/admin/teams': 'admin-teams',
  '/dashboard/admin/users': 'admin-users',
  '/dashboard/admin/workflows': 'admin-workflows',
  // ponytail: bracket segments are dynamic ids — resolveTourId matches them
  // against any single path segment (see below).
  '/dashboard/interviews/[id]': 'interview-detail',
  // User pages with first-visit tours (one entry per page — the registry is
  // keyed by tour id, so ids must be unique across pages).
  '/dashboard/profile': 'profile',
  '/dashboard/notifications': 'notifications',
  '/dashboard/notifications/preferences': 'notification-preferences',
  '/dashboard/jobs': 'jobs',
  '/dashboard/mock-tests': 'mock-tests',
  '/dashboard/mock-tests/[id]': 'mock-test-detail',
  '/dashboard/challenges': 'challenges',
  '/dashboard/courses/[id]': 'course-detail',
  '/dashboard/courses/my': 'my-courses',
  '/dashboard/courses/wishlist': 'wishlist',
  '/dashboard/courses/generate': 'course-generate',
  '/dashboard/problems/[slug]': 'problem-detail',
  '/dashboard/codeathons/[id]': 'codeathon-detail',
  '/dashboard/interviews/schedule': 'interview-schedule',
  '/dashboard/interviews/setup': 'interview-setup',
  '/dashboard/interviews/ai-mock/setup': 'ai-mock-setup',
  '/dashboard/assessments/[id]': 'assessment-detail',
  '/dashboard/resumes': 'resumes',
  '/dashboard/calendar': 'calendar',
  '/dashboard/billing': 'billing',
  '/dashboard/support': 'support',
  '/dashboard/judge': 'judge-desk',
  '/dashboard/activity/sessions': 'sessions',
  '/dashboard/activity/bookmarks': 'bookmarks',
  '/dashboard/referrals': 'referrals',
  '/dashboard/certifications': 'certifications',
  '/dashboard/skill-analytics': 'skill-analytics',
  '/dashboard/resources/[slug]': 'resource-reader',
  '/dashboard/resources': 'resources',
  '/dashboard/interview-prep': 'interview-prep',
  '/dashboard/agent': 'agent',
  '/dashboard/100-days': '100-days',
  '/dashboard/identity-verify': 'identity-verify',
  '/dashboard/arena/[id]': 'arena-detail',
  '/dashboard/settings/ai': 'ai-settings',
  '/dashboard/recruiter-analytics': 'recruiter-analytics',
  '/dashboard/pricing': 'pricing',
  '/dashboard/cad': 'cad',
  '/dashboard/challenges/[id]': 'challenge-detail',
  '/dashboard/team/invites/[token]': 'team-invite',
  // Guide-only pages (no driver.js tour registered — the Guide drawer just
  // shows the written guide and a "Got it" button).
  // Hiring (ATS). '/dashboard/hiring' alone would catch every subpage, so each
  // screen with its own purpose gets an entry; list/detail pairs that share a
  // purpose rely on prefix matching (client → client/jobs/[id]).
  '/dashboard/hiring': 'hiring',
  '/dashboard/hiring/jobs': 'hiring-jobs',
  '/dashboard/hiring/jobs/new': 'hiring-job-editor',
  '/dashboard/hiring/jobs/[id]': 'hiring-job',
  '/dashboard/hiring/jobs/[id]/edit': 'hiring-job-editor',
  '/dashboard/hiring/jobs/[id]/matches': 'hiring-matches',
  '/dashboard/hiring/candidates': 'hiring-candidates',
  '/dashboard/hiring/candidates/[id]': 'hiring-candidate',
  '/dashboard/hiring/approvals': 'hiring-approvals',
  '/dashboard/hiring/analytics': 'hiring-analytics',
  '/dashboard/hiring/interviews': 'hiring-interviews',
  '/dashboard/hiring/interviews/[id]': 'hiring-interview',
  '/dashboard/hiring/interviews/[id]/live': 'hiring-interview-room',
  '/dashboard/hiring/client': 'hiring-client-portal',
  '/dashboard/hiring/clients': 'hiring-clients',
  '/dashboard/hiring/talent': 'hiring-talent',
  '/dashboard/hiring/team': 'hiring-team',
  '/dashboard/hiring/settings': 'hiring-settings',
  '/dashboard/hiring/settings/screening': 'hiring-screening',
  '/dashboard/hiring/settings/bgv': 'hiring-bgv',
  '/dashboard/hiring/settings/integrations': 'hiring-integrations',
  '/dashboard/drives': 'drives',
  '/dashboard/live-drives': 'live-drives',
  '/dashboard/live-drives/[id]': 'live-drive-control',
  '/dashboard/placement': 'placement',
  '/dashboard/placement/drives': 'placement-drive',
  '/dashboard/study-plan': 'study-plan',
  '/dashboard/mentor': 'mentor-studio',
  '/dashboard/cohorts': 'cohorts',
  '/dashboard/cohorts/grading': 'cohort-grading',
  '/dashboard/community': 'community',
  '/dashboard/community/moderation': 'community-moderation',
  '/dashboard/company-tests': 'company-tests',
  '/dashboard/interview-sim': 'interview-sim',
  '/dashboard/interview-sim/[sessionId]': 'interview-sim-session',
  '/dashboard/study-plan/practice': 'study-plan-practice',
  '/dashboard/leagues': 'leagues',
  '/dashboard/passport': 'passport',
  '/dashboard/orders': 'orders',
  '/dashboard/sessions/[id]': 'mentor-session',
  '/dashboard/seller': 'seller',
  '/dashboard/seller/apply': 'seller-apply',
  '/dashboard/checkout': 'checkout',
  '/dashboard/campus': 'campus',
}

/**
 * Longest-prefix match so `/dashboard` doesn't shadow every page.
 * `[param]` segments (e.g. `/dashboard/interviews/[id]`) match any single
 * path segment, so dynamic pages resolve to their own tour instead of the
 * parent list page's tour.
 */
export function resolveTourId(pathname: string): string | null {
  const base = pathname.split('?')[0]
  if (TOUR_ID_FOR_PATHS[base]) return TOUR_ID_FOR_PATHS[base]
  let best: string | null = null
  for (const path of Object.keys(TOUR_ID_FOR_PATHS)) {
    const pattern = new RegExp(
      '^' + path.split('/').map((seg) => (/^\[.+\]$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '(/|$)',
    )
    if (pattern.test(base) && (!best || path.length > best.length)) {
      best = path
    }
  }
  return best ? TOUR_ID_FOR_PATHS[best] : null
}

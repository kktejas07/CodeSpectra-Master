/**
 * Registry of public, indexable static pages. One source for the pages
 * sitemap, llms.txt, the facts endpoint, the admin SEO health panel and the
 * proxy (no CSRF cookie on these, so CDNs can cache them).
 *
 * `updated` is the date the page copy last changed — bump it when you edit a
 * page so sitemap lastmod stays honest.
 */
export type SitemapGroup = 'pages' | 'legal'

export interface PublicRoute {
  path: string
  title: string
  description: string
  group: SitemapGroup
  updated: string
  priority: number
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  /** Structured data the page emits (health panel checks these exist). */
  schema: string[]
  /** Listed in llms.txt "key pages". */
  llms?: boolean
}

const U = '2026-10-19'

export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: '/', title: 'Skills assessments that shortlist for you', description: 'Proctored, auto-scored skills assessments for software, CAD, QA and aptitude roles. CodeSpectra ranks every candidate so you review only the strongest.', group: 'pages', updated: U, priority: 1, changefreq: 'weekly', schema: ['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage'], llms: true },
  { path: '/features', title: 'Features: proctored assessments, scoring and hackathons', description: 'Every CodeSpectra feature: coding and CAD questions, proctoring, difficulty-weighted scoring, plagiarism checks, hackathons, hiring pipeline and integrations.', group: 'pages', updated: U, priority: 0.9, changefreq: 'monthly', schema: ['WebPage', 'FAQPage', 'BreadcrumbList'], llms: true },
  { path: '/pricing', title: 'Pricing: free practice, paid assessment plans', description: 'CodeSpectra pricing. Candidates practise free; hiring teams choose a monthly or annual plan, or a campus or company licence.', group: 'pages', updated: U, priority: 0.9, changefreq: 'weekly', schema: ['SoftwareApplication', 'FAQPage', 'BreadcrumbList'], llms: true },
  { path: '/about', title: 'About CodeSpectra: who we are and who it is for', description: 'What CodeSpectra is, who it is for, how it scores candidates and the team and principles behind it.', group: 'pages', updated: U, priority: 0.7, changefreq: 'monthly', schema: ['AboutPage', 'Organization', 'BreadcrumbList'], llms: true },
  { path: '/faq', title: 'FAQ: assessments, proctoring, scoring and hackathons', description: 'Answers to common questions about CodeSpectra assessments, proctoring, scoring, hackathons, accounts and integrations.', group: 'pages', updated: U, priority: 0.7, changefreq: 'monthly', schema: ['FAQPage', 'BreadcrumbList'], llms: true },
  { path: '/contact', title: 'Contact us or book a pilot', description: 'Talk to the CodeSpectra team: book a pilot on one open role, ask about campus licences, or get support.', group: 'pages', updated: U, priority: 0.6, changefreq: 'yearly', schema: ['ContactPage'], llms: true },
  { path: '/support', title: 'Support and help centre', description: 'Get help with CodeSpectra: candidate test-day help, account issues, billing and contacting support.', group: 'pages', updated: U, priority: 0.5, changefreq: 'monthly', schema: ['WebPage'] },
  { path: '/jobs', title: 'Job board: open tech roles', description: 'Open software, QA and engineering roles posted on CodeSpectra. Search by title, company or skill and apply online.', group: 'pages', updated: U, priority: 0.8, changefreq: 'daily', schema: ['CollectionPage', 'BreadcrumbList'], llms: true },
  { path: '/hackathons', title: 'Hackathons and coding contests on CodeSpectra', description: 'Join CodeSpectra hackathons and speed contests: team up, solve problems, submit your repository and get judged on a shared rubric.', group: 'pages', updated: U, priority: 0.8, changefreq: 'daily', schema: ['CollectionPage'], llms: true },
  { path: '/events', title: 'Hackathons, codeathons and contests worldwide', description: 'Upcoming hackathons, codeathons, buildathons, CTFs and coding contests worldwide. Filter by format, country and deadline.', group: 'pages', updated: U, priority: 0.8, changefreq: 'daily', schema: ['CollectionPage'], llms: true },
  { path: '/learn', title: 'Learn: algorithms, system design and engineering', description: 'Free explainers on algorithms, system design, design patterns and engineering practice, with runnable code and practice problems.', group: 'pages', updated: U, priority: 0.8, changefreq: 'daily', schema: ['CollectionPage'], llms: true },
  { path: '/marketplace', title: 'Marketplace: books, courses and mock interviews', description: 'Buy books, courses, e-books and templates, or book mentoring and mock interviews with CodeSpectra and approved sellers.', group: 'pages', updated: U, priority: 0.7, changefreq: 'daily', schema: ['CollectionPage'], llms: true },
  { path: '/companies', title: 'Company interview prep guides', description: 'How top tech companies interview: rounds, difficulty mix and sample questions, with practice on CodeSpectra.', group: 'pages', updated: U, priority: 0.7, changefreq: 'monthly', schema: ['CollectionPage'], llms: true },
  { path: '/blog', title: 'Newsroom and product blog', description: 'CodeSpectra product news, release notes and hiring insights from the team.', group: 'pages', updated: U, priority: 0.6, changefreq: 'weekly', schema: ['Blog'] },
  { path: '/newsletter', title: 'Newsletter', description: 'Subscribe to the CodeSpectra newsletter for new Learn posts, events and product updates. Browse past issues.', group: 'pages', updated: U, priority: 0.4, changefreq: 'weekly', schema: [] },
  { path: '/docs', title: 'Documentation and user guides', description: 'CodeSpectra documentation: getting started, building assessments, proctoring, hackathons, integrations and the API.', group: 'pages', updated: U, priority: 0.7, changefreq: 'weekly', schema: ['BreadcrumbList'], llms: true },
  { path: '/api-reference', title: 'API reference', description: 'The CodeSpectra REST API: authentication, assessments, candidates, results and webhooks.', group: 'pages', updated: U, priority: 0.5, changefreq: 'monthly', schema: [], llms: true },
  { path: '/careers', title: 'Careers at CodeSpectra', description: 'Work on CodeSpectra: open roles on the team building skills assessments and hiring tools.', group: 'pages', updated: U, priority: 0.4, changefreq: 'monthly', schema: [] },
  { path: '/security', title: 'Security and data protection', description: 'How CodeSpectra protects candidate and customer data: encryption, access control, proctoring data handling and disclosure.', group: 'pages', updated: U, priority: 0.5, changefreq: 'yearly', schema: [], llms: true },
  { path: '/open-source', title: 'Open source', description: 'Open-source software CodeSpectra builds on and contributes to.', group: 'pages', updated: U, priority: 0.3, changefreq: 'yearly', schema: [] },
  { path: '/status', title: 'System status', description: 'Live status of CodeSpectra services: web app, code execution, proctoring and email.', group: 'pages', updated: U, priority: 0.3, changefreq: 'daily', schema: [] },
  { path: '/editorial-policy', title: 'Editorial policy and team', description: 'How CodeSpectra writes, reviews, sources and corrects Learn posts and other published content, and who is responsible.', group: 'pages', updated: U, priority: 0.4, changefreq: 'yearly', schema: ['AboutPage'], llms: true },
  { path: '/compare', title: 'CodeSpectra compared', description: 'Side-by-side comparisons of CodeSpectra with other assessment and hiring tools, with sources.', group: 'pages', updated: U, priority: 0.5, changefreq: 'monthly', schema: ['CollectionPage'] },
  { path: '/privacy', title: 'Privacy policy', description: 'How CodeSpectra collects, uses, stores and protects personal data, including proctoring recordings and your rights.', group: 'legal', updated: U, priority: 0.3, changefreq: 'yearly', schema: [] },
  { path: '/terms', title: 'Terms of service', description: 'The terms that govern use of CodeSpectra by candidates, hiring teams and organisations.', group: 'legal', updated: U, priority: 0.3, changefreq: 'yearly', schema: [] },
  { path: '/cookies', title: 'Cookie policy', description: 'Which cookies CodeSpectra sets, why, for how long, and how to control them.', group: 'legal', updated: U, priority: 0.2, changefreq: 'yearly', schema: [] },
]

export function publicRoute(path: string): PublicRoute | undefined {
  return PUBLIC_ROUTES.find((r) => r.path === path)
}

/** Prefixes of public content sections (detail pages live under these). */
const PUBLIC_PREFIXES = ['/learn/', '/events/', '/jobs/', '/marketplace/p/', '/marketplace/s/', '/companies/', '/docs/', '/blog/', '/newsletter/', '/compare/']

/**
 * True for public, cacheable marketing/content pages (no per-user cookies needed).
 * Token/private pages under these trees (/hackathons/x/join/…) are excluded.
 */
export function isPublicMarketingPath(pathname: string): boolean {
  if (pathname === '/og') return true
  if (PUBLIC_ROUTES.some((r) => r.path === pathname)) return true
  if (pathname.startsWith('/marketplace/cart') || pathname.startsWith('/marketplace/checkout')) return false
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

/**
 * Paths crawlers must not fetch (robots Disallow). Certificate verification
 * pages (/cert/verify, /hackathons/verify) are NOT here: they are shared on
 * LinkedIn, whose preview bot obeys robots.txt — they carry noindex instead.
 */
export const DISALLOWED_PATHS = [
  '/api/',
  '/dashboard/',
  '/auth/',
  '/login',
  '/signup',
  '/marketplace/cart',
  '/marketplace/checkout',
  '/assessment/',
  '/bgv/',
  '/hr-form/',
  '/interview/',
  '/hiring-invite/',
  '/qr/',
  '/hackathons/join',
  '/hackathons/*/join/',
  '/hackathons/*/workspace',
  '/hackathons/*/report',
  '/codeathons/',
  '/users/',
  '/subscriptions/',
  '/newsletter/confirm',
  '/maintenance',
  '/mcp',
  '/remotion',
  '/*?*token=',
]

/** Public API endpoints AI agents may read despite /api/ being disallowed. */
export const ALLOWED_API_PATHS = ['/api/public/facts']

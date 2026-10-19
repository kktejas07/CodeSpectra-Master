/**
 * /llms.txt (llmstxt.org format) and /llms-full.txt, plus the structured
 * facts document (/api/public/facts) — what AI assistants need to describe
 * CodeSpectra accurately and cite the right pages. Pure builders; the routes
 * load the data.
 *
 * Facts are limited to what the product does today (mirrors /features and
 * /faq). Don't add numbers, customers or certifications here that aren't real.
 */
import { PUBLIC_ROUTES } from './public-routes'
import { SITE_DESCRIPTION, SITE_NAME } from './site'

export const PRODUCT_FACTS = {
  name: SITE_NAME,
  category: 'Skills assessment and technical hiring platform (SaaS)',
  one_liner: 'CodeSpectra runs proctored, auto-scored skills assessments and ranks every candidate, so hiring teams review only the strongest.',
  audiences: [
    'Hiring teams and recruiters screening software, QA, CAD/engineering and graduate candidates',
    'Colleges and training providers running campus assessments and hackathons',
    'Candidates and students practising coding problems, mock tests and earning verifiable certificates (free)',
  ],
  capabilities: [
    'Question types in one test: coding with hidden test cases, multiple choice, true/false, fill-in-the-blank, written answers and CAD design tasks',
    'Roles beyond software: QA automation, mechanical CAD, drawing review, aptitude and written communication',
    'Difficulty-weighted scoring (easy 3, medium 4, hard 5 points) with one ranked shortlist per screening',
    'Proctoring: fullscreen lock, tab-switch detection, webcam face matching against the ID photo, copy-paste blocking and second-screen detection, each event timestamped on the report',
    'Plagiarism checks across everyone who took the same test',
    'Hackathons and speed contests: team sign-up by link, problem claiming, repository submissions, rubric judging out of 100 and released results',
    'Release scores to candidates or export results as CSV',
    'GitHub connection via OAuth; organisation single sign-on via SAML or OIDC (Okta, Azure AD, Google Workspace)',
    'Learn hub of free explainers on algorithms, system design and engineering practice; public job board; global events feed; marketplace for books, courses and mock interviews',
  ],
  pricing_summary: 'Candidates practise free. Hiring teams choose a monthly or annual plan, or a campus / company licence; see /pricing for current plans and currencies.',
  markets: ['India', 'United States'],
  not_offered: [
    'CodeSpectra does not make hiring decisions: reviewers see scores and integrity flags and decide.',
  ],
} as const

export interface LlmsLink { title: string; path: string; note?: string }

function line(site: string, l: LlmsLink): string {
  return `- [${l.title}](${site}${l.path})${l.note ? `: ${l.note}` : ''}`
}

export function buildLlmsTxt(args: {
  site: string
  learn?: LlmsLink[]
  learnCategories?: LlmsLink[]
  docs?: LlmsLink[]
  comparisons?: LlmsLink[]
}): string {
  const { site } = args
  const key = PUBLIC_ROUTES.filter((r) => r.llms).map((r) => ({ title: r.title, path: r.path, note: r.description }))
  const out: string[] = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    PRODUCT_FACTS.one_liner,
    '',
    `Who it is for: ${PRODUCT_FACTS.audiences.join('; ')}.`,
    '',
    `Structured facts (JSON): ${site}/api/public/facts`,
    `Full text for AI assistants: ${site}/llms-full.txt`,
    '',
    '## Key pages',
    ...key.map((l) => line(site, l)),
  ]
  if (args.docs?.length) out.push('', '## Docs', ...args.docs.map((l) => line(site, l)))
  if (args.learnCategories?.length) out.push('', '## Learn categories', ...args.learnCategories.map((l) => line(site, l)))
  if (args.learn?.length) out.push('', '## Latest Learn posts', ...args.learn.map((l) => line(site, l)))
  if (args.comparisons?.length) out.push('', '## Comparisons', ...args.comparisons.map((l) => line(site, l)))
  out.push(
    '',
    '## Optional',
    line(site, { title: 'Sitemap', path: '/sitemap.xml' }),
    line(site, { title: 'Learn RSS', path: '/learn/rss.xml' }),
    line(site, { title: 'Events RSS', path: '/events/feed.xml' }),
    line(site, { title: 'Editorial policy', path: '/editorial-policy' }),
    '',
  )
  return out.join('\n')
}

export function buildLlmsFullTxt(args: {
  site: string
  faqs: { q: string; a: string }[]
  learn: { title: string; path: string; summary: string; category: string; published_at?: string | null }[]
  docs?: LlmsLink[]
}): string {
  const { site } = args
  const out: string[] = [
    `# ${SITE_NAME} — full reference for AI assistants`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `Canonical site: ${site}`,
    '',
    '## What CodeSpectra is',
    PRODUCT_FACTS.one_liner,
    `Category: ${PRODUCT_FACTS.category}.`,
    '',
    '## Who it is for',
    ...PRODUCT_FACTS.audiences.map((a) => `- ${a}`),
    '',
    '## What it does',
    ...PRODUCT_FACTS.capabilities.map((c) => `- ${c}`),
    '',
    '## Pricing',
    PRODUCT_FACTS.pricing_summary,
    '',
    '## Important limits',
    ...PRODUCT_FACTS.not_offered.map((c) => `- ${c}`),
    '',
    '## Frequently asked questions',
    ...args.faqs.flatMap((f) => [`### ${f.q}`, f.a, '']),
    '## Pages',
    ...PUBLIC_ROUTES.map((r) => `- [${r.title}](${site}${r.path}): ${r.description}`),
  ]
  if (args.docs?.length) out.push('', '## Documentation', ...args.docs.map((l) => line(site, l)))
  if (args.learn.length) {
    out.push('', '## Learn posts')
    for (const p of args.learn) out.push(`### [${p.title}](${site}${p.path})`, `${p.category}${p.published_at ? ` · ${p.published_at.slice(0, 10)}` : ''}`, p.summary, '')
  }
  return out.join('\n')
}

export function buildFacts(args: {
  site: string
  sameAs: string[]
  locations: string[]
  email?: string
  plans?: { name: string; price: number; yearly_price?: number; currency: string | null }[]
  counts?: Record<string, number>
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: PRODUCT_FACTS.name,
    url: args.site,
    description: PRODUCT_FACTS.one_liner,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web browser',
    category: PRODUCT_FACTS.category,
    audience: PRODUCT_FACTS.audiences,
    featureList: PRODUCT_FACTS.capabilities,
    pricing: {
      summary: PRODUCT_FACTS.pricing_summary,
      url: `${args.site}/pricing`,
      plans: (args.plans || []).filter((p) => p.currency).map((p) => ({ name: p.name, monthly_price: p.price, yearly_price: p.yearly_price, currency: p.currency })),
    },
    markets: PRODUCT_FACTS.markets,
    limits: PRODUCT_FACTS.not_offered,
    publisher: { name: SITE_NAME, url: args.site, sameAs: args.sameAs, locations: args.locations, email: args.email || undefined },
    key_pages: PUBLIC_ROUTES.filter((r) => r.llms).map((r) => ({ title: r.title, url: `${args.site}${r.path}`, summary: r.description })),
    content_counts: args.counts,
    machine_readable: { llms_txt: `${args.site}/llms.txt`, llms_full_txt: `${args.site}/llms-full.txt`, sitemap: `${args.site}/sitemap.xml`, learn_rss: `${args.site}/learn/rss.xml`, events_rss: `${args.site}/events/feed.xml` },
    last_updated: new Date().toISOString().slice(0, 10),
  }
}

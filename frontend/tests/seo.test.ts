/**
 * SEO / GEO / AEO (lib/seo): metadata builders, JSON-LD required fields per
 * type, robots rules, sitemap XML, llms.txt, settings validation, IndexNow
 * payloads, Learn answer extraction and the health checks.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMetadata, canonicalPath, clampText, ogImagePath, pageTitle, privateMetadata, DESCRIPTION_MAX, TITLE_MAX } from '@/lib/seo/metadata'
import { absoluteUrl, getSiteUrl, resolveSiteUrl, DEFAULT_SITE_URL } from '@/lib/seo/site'
import {
  articleJsonLd, breadcrumbJsonLd, courseJsonLd, employmentType, eventJsonLd, faqJsonLd, howToJsonLd, jobPostingJsonLd, jobValidThrough,
  organizationJsonLd, parseJobLocation, productJsonLd, softwareApplicationJsonLd, validateJsonLd, websiteJsonLd, type JobInput,
} from '@/lib/seo/jsonld'
import { buildRobots } from '@/lib/seo/robots'
import { buildSitemapIndexXml, buildUrlsetXml, isSitemapType, latestLastmod, staticEntries } from '@/lib/seo/sitemap'
import { buildFacts, buildLlmsFullTxt, buildLlmsTxt } from '@/lib/seo/llms'
import { AI_CRAWLERS, DEFAULT_SEO_SETTINGS, isValidIndexNowKey, mergeSeoSettings } from '@/lib/seo/settings-shared'
import { buildIndexNowPayload, generateIndexNowKey } from '@/lib/seo/indexnow'
import { extractFaqs, extractKeyTakeaways, wordCount } from '@/lib/seo/learn-extract'
import { isPublicMarketingPath, PUBLIC_ROUTES, DISALLOWED_PATHS } from '@/lib/seo/public-routes'
import { ALL_SITE_FAQS, LANDING_FAQS, pricingFaqs } from '@/lib/seo/faq-content'
import { checkJob, checkSettings, checkStaticPage, scoreIssues } from '@/lib/seo/health'
import { serializeJsonLd } from '@/components/seo/json-ld'

const SITE = 'https://codespectra.ai'

afterEach(() => vi.unstubAllEnvs())

// ─── Site URL ────────────────────────────────────────────────────────────────

describe('site url', () => {
  it('prefers NEXT_PUBLIC_SITE_URL, ignores localhost app URLs, falls back to codespectra.ai', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    expect(getSiteUrl()).toBe(DEFAULT_SITE_URL)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com/')
    expect(getSiteUrl()).toBe('https://app.example.com')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.codespectra.ai/some/path')
    expect(getSiteUrl()).toBe('https://www.codespectra.ai')
  })

  it('admin override wins only when it is a public https origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://codespectra.ai')
    expect(resolveSiteUrl('https://cs.example.org')).toBe('https://cs.example.org')
    expect(resolveSiteUrl('http://localhost:3000')).toBe('https://codespectra.ai')
    expect(resolveSiteUrl('javascript:alert(1)')).toBe('https://codespectra.ai')
    expect(absoluteUrl('/learn', SITE)).toBe(`${SITE}/learn`)
    expect(absoluteUrl('https://x.test/a', SITE)).toBe('https://x.test/a')
  })
})

// ─── Metadata ────────────────────────────────────────────────────────────────

describe('metadata builders', () => {
  it('keeps titles ≤ 60 chars with the brand and descriptions ≤ 160', () => {
    expect(pageTitle('Pricing')).toBe('Pricing | CodeSpectra')
    const long = pageTitle('A very long title about binary search trees and their many balanced variants explained')
    expect(long.length).toBeLessThanOrEqual(TITLE_MAX)
    expect(clampText('word '.repeat(80), DESCRIPTION_MAX).length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    expect(clampText('short', 160)).toBe('short')
  })

  it('emits canonical without query, full Open Graph + Twitter and an OG image', () => {
    const m = buildMetadata({ title: 'Jobs', description: 'Open roles.', path: '/jobs?q=java#top', kind: 'job' })
    expect(m.alternates?.canonical).toBe('/jobs')
    expect(m.title).toEqual({ absolute: 'Jobs | CodeSpectra' })
    const og = m.openGraph as { url: string; images: { url: string }[]; siteName: string }
    expect(og.url).toBe('/jobs')
    expect(og.siteName).toBe('CodeSpectra')
    expect(og.images[0].url).toContain('/og?')
    expect(og.images[0].url).toContain('kind=job')
    expect((m.twitter as { card: string }).card).toBe('summary_large_image')
    expect((m.robots as { index: boolean }).index).toBe(true)
  })

  it('supports noindex,follow, canonical overrides and private pages', () => {
    const filtered = buildMetadata({ title: 'Learn', description: 'x', path: '/learn', noIndex: 'follow' })
    expect(filtered.robots).toEqual({ index: false, follow: true })
    const dup = buildMetadata({ title: 'Hack', description: 'x', path: '/events/abc', canonical: '/hackathons/hack' })
    expect(dup.alternates?.canonical).toBe('/hackathons/hack')
    const priv = privateMetadata('Interview')
    expect(priv.referrer).toBe('no-referrer')
    expect((priv.robots as { index: boolean; follow: boolean }).index).toBe(false)
    expect(canonicalPath('/docs/')).toBe('/docs')
    expect(ogImagePath({ title: 'Hello & <b>', kind: 'event' })).toMatch(/^\/og\?title=Hello\+%26\+%3Cb%3E&kind=event&s=[A-Za-z0-9_-]{22}$/)
  })

  it('every registered public page has a unique title within limits', () => {
    const titles = PUBLIC_ROUTES.map((r) => pageTitle(r.title))
    expect(new Set(titles).size).toBe(titles.length)
    for (const r of PUBLIC_ROUTES) {
      expect(pageTitle(r.title).length, r.path).toBeLessThanOrEqual(TITLE_MAX)
      expect(r.description.length, r.path).toBeLessThanOrEqual(DESCRIPTION_MAX)
      expect(r.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

// ─── JSON-LD ─────────────────────────────────────────────────────────────────

const job = (over: Partial<JobInput> = {}): JobInput => ({
  id: 'j1', title: 'Backend Engineer', company: 'Acme', location: 'Hyderabad, India', job_type: 'Full-time',
  description: 'Build APIs.', requirements: 'Go <3', benefits: null, skills: ['Go', 'SQL'],
  salary: { min: 1_500_000, max: 2_500_000, currency: 'INR' }, created_at: '2026-10-01T00:00:00.000Z', is_active: true, ...over,
})

describe('JSON-LD builders satisfy required fields', () => {
  it('Organization, WebSite (SearchAction) and BreadcrumbList', () => {
    const org = organizationJsonLd({ site: SITE, sameAs: ['https://github.com/x'], locations: ['Hyderabad, Telangana, IN', 'Princeton, NJ, US'] })
    expect(validateJsonLd(org)).toEqual([])
    expect((org.address as unknown[]).length).toBe(2)
    expect((org.logo as { url: string }).url).toBe(`${SITE}/logo.png`)
    const site = websiteJsonLd(SITE)
    expect(validateJsonLd(site)).toEqual([])
    expect(JSON.stringify(site.potentialAction)).toContain('{search_term_string}')
    const bc = breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Learn', path: '/learn' }], SITE)
    expect(validateJsonLd(bc)).toEqual([])
    expect(breadcrumbJsonLd([], SITE)).toBeNull()
  })

  it('FAQPage, HowTo, Course and SoftwareApplication', () => {
    expect(validateJsonLd(faqJsonLd(ALL_SITE_FAQS))).toEqual([])
    expect(faqJsonLd([{ q: ' ', a: 'x' }])).toBeNull()
    expect(validateJsonLd(howToJsonLd({ site: SITE, name: 'Prep', steps: [{ name: 'A', text: 'a' }, { name: 'B', text: 'b' }] }))).toEqual([])
    expect(howToJsonLd({ site: SITE, name: 'Prep', steps: [{ name: 'A', text: 'a' }] })).toBeNull()
    expect(validateJsonLd(courseJsonLd({ site: SITE, name: 'DSA', description: 'Course', path: '/c', price: 0, currency: 'INR' }))).toEqual([])
    const app = softwareApplicationJsonLd({ site: SITE, plans: [{ name: 'Pro', price: 29, currency: 'USD' }, { name: 'Bad', price: 9, currency: null }] })
    expect(validateJsonLd(app)).toEqual([])
    expect((app.offers as unknown[]).length).toBe(1)
  })

  it('Article for Learn has author, publisher logo, dates, image and citations', () => {
    const a = articleJsonLd({ site: SITE, type: 'TechArticle', path: '/learn/bfs', headline: 'BFS', description: 'Breadth-first search', datePublished: '2026-10-01', image: '/learn/bfs/opengraph-image', citations: ['https://en.wikipedia.org/wiki/BFS'], speakable: ['.speakable-summary'] })
    expect(validateJsonLd(a)).toEqual([])
    expect((a.publisher as { logo: { url: string } }).logo.url).toBe(`${SITE}/logo.png`)
    expect(a.citation).toEqual(['https://en.wikipedia.org/wiki/BFS'])
    expect(validateJsonLd(articleJsonLd({ site: SITE, path: '/x', headline: 'x', description: 'x' }))).toContain('datePublished')
  })

  it('Event requires a start date; maps attendance mode, status, location and free offers', () => {
    const base = { name: 'Hack', description: 'd', mode: 'in_person' as const, url: 'https://org.test/e', pageUrl: '/events/1', city: 'Pune', country: 'IN' }
    expect(eventJsonLd({ ...base, startsAt: null }, SITE)).toBeNull()
    const ev = eventJsonLd({ ...base, startsAt: '2026-11-01T09:00:00Z', free: true }, SITE)!
    expect(validateJsonLd(ev)).toEqual([])
    expect(ev.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode')
    expect(ev.eventStatus).toBe('https://schema.org/EventScheduled')
    expect((ev.location as { address: { addressCountry: string } }).address.addressCountry).toBe('IN')
    expect((ev.offers as { price: string }).price).toBe('0')
    const online = eventJsonLd({ ...base, mode: 'online', startsAt: '2026-11-01T09:00:00Z' }, SITE)!
    expect((online.location as { '@type': string })['@type']).toBe('VirtualLocation')
  })

  it('Product has offer price/currency/seller; Service never gets AggregateRating', () => {
    const args = { site: SITE, path: '/marketplace/p/book', name: 'Book', description: 'A book', sku: 'p1', priceMinor: 49900, currency: 'INR', inStock: true, sellerName: 'CodeSpectra', rating: { avg: 4.5, count: 3 } }
    const p = productJsonLd({ ...args, kind: 'physical', shipping: { dispatchDays: 2, shipsFromCountry: 'IN' } })
    expect(validateJsonLd(p)).toEqual([])
    expect((p.offers as { price: string }).price).toBe('499.00')
    expect(p.aggregateRating).toBeTruthy()
    const svc = productJsonLd({ ...args, kind: 'service' })
    expect(svc['@type']).toBe('Service')
    expect(svc.aggregateRating).toBeUndefined()
    const course = productJsonLd({ ...args, kind: 'digital', isCourse: true })
    expect(course['@type']).toEqual(['Product', 'Course'])
  })

  it('JobPosting has every Google-required field for on-site and remote jobs', () => {
    const now = new Date('2026-10-19T00:00:00Z')
    const onsite = jobPostingJsonLd(job(), SITE, now)
    expect(validateJsonLd(onsite)).toEqual([])
    expect(onsite.employmentType).toEqual(['FULL_TIME'])
    expect((onsite.jobLocation as { address: { addressLocality: string; addressCountry: string } }).address).toMatchObject({ addressLocality: 'Hyderabad', addressCountry: 'IN' })
    expect((onsite.baseSalary as { currency: string; value: { unitText: string } }).value.unitText).toBe('YEAR')
    expect(onsite.directApply).toBe(true)
    expect(String(onsite.description)).toContain('&lt;3') // escaped HTML description

    const remote = jobPostingJsonLd(job({ location: 'Remote (India)' }), SITE, now)
    expect(remote.jobLocationType).toBe('TELECOMMUTE')
    expect(remote.applicantLocationRequirements).toEqual([{ '@type': 'Country', name: 'IN' }])
    expect(validateJsonLd(remote)).toEqual([])

    // A remote job without a country is reported, never guessed.
    const vague = jobPostingJsonLd(job({ location: 'Remote' }), SITE, now)
    expect(vague.applicantLocationRequirements).toBeUndefined()
    expect(validateJsonLd(vague).join()).toContain('applicantLocationRequirements')
  })

  it('job helpers: employment types, US/IN location parsing, validThrough', () => {
    expect(employmentType('Contract')).toEqual(['CONTRACTOR'])
    expect(employmentType('Internship')).toEqual(['INTERN'])
    expect(employmentType(null)).toEqual(['OTHER'])
    expect(parseJobLocation('Princeton, NJ')).toMatchObject({ remote: false, city: 'Princeton', region: 'NJ', countries: ['US'] })
    expect(parseJobLocation('Bengaluru / Remote').countries).toEqual(['IN'])
    const now = new Date('2026-10-19T00:00:00Z')
    expect(jobValidThrough({ valid_through: '2026-12-31T00:00:00Z', created_at: '2026-01-01' }, now)).toBe('2026-12-31T00:00:00.000Z')
    // Old but still active: rolls 30 days ahead.
    expect(Date.parse(jobValidThrough({ created_at: '2025-01-01T00:00:00Z' }, now))).toBe(now.getTime() + 30 * 86_400_000)
  })

  it('serialises safely inside a script tag', () => {
    expect(serializeJsonLd({ a: '</script><script>alert(1)</script>' })).not.toContain('</script>')
  })
})

// ─── robots.txt ──────────────────────────────────────────────────────────────

describe('robots', () => {
  it('disallows private/token pages, points to the sitemap and allows AI crawlers by default', () => {
    const r = buildRobots(DEFAULT_SEO_SETTINGS, SITE)
    expect(r.sitemap).toBe(`${SITE}/sitemap.xml`)
    const rules = r.rules as { userAgent: string; allow?: string | string[]; disallow?: string | string[] }[]
    const star = rules.find((x) => x.userAgent === '*')!
    for (const p of ['/api/', '/dashboard/', '/auth/', '/marketplace/checkout', '/bgv/', '/interview/', '/assessment/']) expect(star.disallow).toContain(p)
    expect(star.allow).toContain('/api/public/facts')
    for (const bot of AI_CRAWLERS) {
      const rule = rules.find((x) => x.userAgent === bot.id)!
      expect(rule.allow).toContain('/')
      expect(rule.allow).toContain('/llms.txt')
    }
    // Certificate pages stay crawlable (LinkedIn previews) — they carry noindex instead.
    expect(DISALLOWED_PATHS).not.toContain('/cert/')
  })

  it('blocks a crawler the admin switched off', () => {
    const s = mergeSeoSettings({ ai_crawlers: { GPTBot: false } })
    const rules = buildRobots(s, SITE).rules as { userAgent: string; disallow?: string | string[] }[]
    expect(rules.find((x) => x.userAgent === 'GPTBot')!.disallow).toBe('/')
    expect(rules.find((x) => x.userAgent === 'ClaudeBot')!.disallow).not.toBe('/')
  })
})

// ─── Sitemaps ────────────────────────────────────────────────────────────────

describe('sitemaps', () => {
  it('urlset escapes, de-duplicates and only writes real lastmod values', () => {
    const xml = buildUrlsetXml([
      { path: '/learn/a&b', lastmod: '2026-10-01T00:00:00Z', changefreq: 'monthly', priority: 0.6 },
      { path: '/learn/a&b' },
      { path: '/jobs/x', lastmod: 'not-a-date' },
    ], SITE)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.match(/<url>/g)).toHaveLength(2)
    expect(xml).toContain(`<loc>${SITE}/learn/a%26b</loc>`)
    expect(xml).toContain('<lastmod>2026-10-01T00:00:00.000Z</lastmod>')
    expect(xml).not.toContain('not-a-date')
  })

  it('index lists per-type sitemaps with lastmod', () => {
    const xml = buildSitemapIndexXml([{ type: 'learn', lastmod: '2026-10-02' }, { type: 'jobs' }], SITE)
    expect(xml).toContain(`<loc>${SITE}/sitemaps/learn.xml</loc><lastmod>2026-10-02T00:00:00.000Z</lastmod>`)
    expect(xml).toContain(`${SITE}/sitemaps/jobs.xml`)
    expect(isSitemapType('jobs')).toBe(true)
    expect(isSitemapType('../etc')).toBe(false)
    expect(latestLastmod([{ path: '/a', lastmod: '2026-01-01' }, { path: '/b', lastmod: '2026-05-01' }])).toBe('2026-05-01T00:00:00.000Z')
  })

  it('static pages carry their content date, never "now", and legal pages are separate', () => {
    const pages = staticEntries('pages')
    expect(pages.find((e) => e.path === '/')).toBeTruthy()
    expect(pages.every((e) => e.lastmod && !Number.isNaN(Date.parse(e.lastmod)))).toBe(true)
    expect(staticEntries('legal').map((e) => e.path).sort()).toEqual(['/cookies', '/privacy', '/terms'])
  })
})

// ─── llms.txt / facts ────────────────────────────────────────────────────────

describe('llms.txt and facts', () => {
  it('llms.txt follows the llmstxt.org shape with key pages and learn links', () => {
    const txt = buildLlmsTxt({ site: SITE, learn: [{ title: 'BFS', path: '/learn/bfs', note: 'Graph search' }], learnCategories: [{ title: 'System design', path: '/learn?category=system-design' }] })
    expect(txt.startsWith('# CodeSpectra\n\n> ')).toBe(true)
    expect(txt).toContain('## Key pages')
    expect(txt).toContain(`- [Pricing: free practice, paid assessment plans](${SITE}/pricing)`)
    expect(txt).toContain(`- [BFS](${SITE}/learn/bfs): Graph search`)
    expect(txt).toContain(`${SITE}/api/public/facts`)
    expect(txt).not.toContain('/dashboard')
  })

  it('llms-full.txt carries the FAQ and facts JSON describes the product', () => {
    const full = buildLlmsFullTxt({ site: SITE, faqs: LANDING_FAQS, learn: [] })
    expect(full).toContain('### What is CodeSpectra?')
    const facts = buildFacts({ site: SITE, sameAs: [], locations: ['Hyderabad, IN'], plans: [{ name: 'Pro', price: 29, currency: 'USD' }, { name: 'Custom', price: 0, currency: null }] })
    expect(facts.name).toBe('CodeSpectra')
    expect((facts.pricing as { plans: unknown[] }).plans).toHaveLength(1)
    expect(pricingFaqs(20).find((f) => f.q.includes('annual'))!.a).toContain('20%')
  })
})

// ─── Settings / IndexNow ─────────────────────────────────────────────────────

describe('settings validation', () => {
  it('drops bad URLs, keeps defaults and only enables IndexNow with a valid key', () => {
    const s = mergeSeoSettings({
      site_url: 'ftp://nope', social_profiles: ['https://linkedin.com/company/x', 'javascript:alert(1)'],
      indexnow_enabled: true, indexnow_key: 'short', verification: { google: 'abc<script>' },
      comparisons: [{ competitor: 'HackerRank', rows: [{ feature: 'Proctoring', codespectra: 'Yes', competitor: '' }], sources: ['https://x.test', 'bad'] }, { competitor: 'HackerRank' }],
    })
    expect(s.site_url).toBe('')
    expect(s.social_profiles).toEqual(['https://linkedin.com/company/x'])
    expect(s.indexnow_enabled).toBe(false)
    expect(s.verification.google).toBe('abcscript')
    expect(s.comparisons).toHaveLength(1) // duplicate slug dropped
    expect(s.comparisons[0]).toMatchObject({ slug: 'hackerrank', published: false, sources: ['https://x.test'] })
    expect(s.ai_crawlers.GPTBot).toBe(true)
    expect(mergeSeoSettings({ indexnow_enabled: true, indexnow_key: 'abcdef1234' }).indexnow_enabled).toBe(true)
  })

  it('IndexNow payload keeps same-host URLs and points keyLocation at the key file', () => {
    const key = generateIndexNowKey()
    expect(isValidIndexNowKey(key)).toBe(true)
    const p = buildIndexNowPayload(SITE, key, [`${SITE}/learn/a`, `${SITE}/learn/a`, 'https://evil.test/x', 'not a url'])
    expect(p).toEqual({ host: 'codespectra.ai', key, keyLocation: `${SITE}/indexnow-key.txt`, urlList: [`${SITE}/learn/a`] })
  })
})

// ─── Learn answer extraction ────────────────────────────────────────────────

describe('learn extraction', () => {
  const md = `## What it is

Binary search is a way to find an item in a sorted list by halving the range.

**Key takeaways**

- Needs sorted input
- Runs in \`O(log n)\`
- Off-by-one errors are common

## Interview questions

1. **What is the time complexity of binary search?**

   It runs in O(log n) time because each step halves the range.

2. **Does binary search work on linked lists?**

   Not efficiently: random access is O(n), so you lose the speed-up.

## Practice

Try it.`

  it('pulls FAQ pairs, key takeaways and a word count', () => {
    const faqs = extractFaqs(md)
    expect(faqs).toHaveLength(2)
    expect(faqs[0]).toEqual({ q: 'What is the time complexity of binary search?', a: 'It runs in O(log n) time because each step halves the range.' })
    expect(validateJsonLd(faqJsonLd(faqs))).toEqual([])
    expect(extractKeyTakeaways(md)).toEqual(['Needs sorted input', 'Runs in O(log n)', 'Off-by-one errors are common'])
    expect(wordCount(md)).toBeGreaterThan(40)
    expect(extractFaqs('## Other\n\ntext')).toEqual([])
  })
})

// ─── Public paths / health ───────────────────────────────────────────────────

describe('public paths and health', () => {
  it('identifies cacheable public pages, excluding cart/checkout and app pages', () => {
    expect(isPublicMarketingPath('/')).toBe(true)
    expect(isPublicMarketingPath('/learn/binary-search')).toBe(true)
    expect(isPublicMarketingPath('/jobs/abc')).toBe(true)
    expect(isPublicMarketingPath('/marketplace/cart')).toBe(false)
    expect(isPublicMarketingPath('/dashboard')).toBe(false)
    expect(isPublicMarketingPath('/hackathons/x/join/token')).toBe(false)
    expect(isPublicMarketingPath('/auth/login')).toBe(false)
  })

  it('flags weak pages, ineligible jobs and setup gaps', () => {
    expect(checkStaticPage({ path: '/x', title: 'X', description: 'too short', group: 'pages', updated: '2026-10-19', priority: 0.5, changefreq: 'monthly', schema: [] }).map((i) => i.area)).toContain('Descriptions')
    expect(checkJob(job(), SITE)).toBeNull()
    expect(checkJob(job({ location: 'Remote' }), SITE)?.severity).toBe('error')
    const gaps = checkSettings(DEFAULT_SEO_SETTINGS, 'default')
    expect(gaps.map((g) => g.item)).toEqual(expect.arrayContaining(['IndexNow', 'Google Search Console', 'Social profiles']))
    expect(scoreIssues([])).toBe(100)
    expect(scoreIssues(gaps)).toBeLessThan(100)
  })
})

/**
 * Audit-5 SEO fixes (pure logic): CDN cache header for public HTML (SEO-004),
 * English-body pages canonicalise to English (SEO-034), job locations
 * (SEO-035), forum / mentor JSON-LD (SEO-036), llms facts (SEO-037), OG card
 * text without Indic glyphs (SEO-030), sitemap types (SEO-028), LTI robots
 * (SEO-022), lazy Firebase decision (SEO-032), public client namespaces (SEO-031).
 */
import { describe, expect, it, vi } from 'vitest'
import { PUBLIC_HTML_CACHE_CONTROL, publicHtmlCacheControl } from '@/lib/cache/cdn-headers'
import { canonicalLocalePath, hreflangAlternates, isEnglishBodyPath, isLocalizedPath } from '@/lib/i18n/public-paths'
import { buildMetadata } from '@/lib/seo/metadata'
import {
  discussionForumPostingJsonLd, jobPostingJsonLd, mentorJsonLd, parseJobLocation, validJsonLd, validateJsonLd, type JobInput,
} from '@/lib/seo/jsonld'
import { buildLlmsTxt, PRODUCT_FACTS } from '@/lib/seo/llms'
import { PUBLIC_ROUTES, DISALLOWED_PATHS } from '@/lib/seo/public-routes'
import { indicScript, ogCardText } from '@/lib/seo/og-text'
import { SITEMAP_TYPES, withLocalizedEntries } from '@/lib/seo/sitemap'

vi.mock('server-only', () => ({}))

const H = (o: Record<string, string> = {}) => ({ get: (k: string) => o[k.toLowerCase()] ?? null })

describe('SEO-004: CDN cache header for public HTML', () => {
  it('public pages (all languages) get a shared-cache header', () => {
    for (const p of ['/', '/pricing', '/events', '/learn', '/hi', '/te/events', '/hi/learn', '/learn/some-post', '/news/x', '/digest/2026-10-01']) {
      expect(publicHtmlCacheControl({ method: 'GET', pathname: p, headers: H(), env: {} }), p).toBe(PUBLIC_HTML_CACHE_CONTROL)
    }
    expect(PUBLIC_HTML_CACHE_CONTROL).toMatch(/public/)
    expect(PUBLIC_HTML_CACHE_CONTROL).toMatch(/max-age=0/)
    expect(PUBLIC_HTML_CACHE_CONTROL).toMatch(/s-maxage=\d+/)
  })

  it('never on private pages, files, RSC / prefetch / action requests, drafts or non-GET', () => {
    const none = (o: Partial<Parameters<typeof publicHtmlCacheControl>[0]>) =>
      publicHtmlCacheControl({ method: 'GET', pathname: '/pricing', headers: H(), env: {}, ...o })
    expect(none({ pathname: '/dashboard' })).toBeNull()
    expect(none({ pathname: '/auth/login' })).toBeNull()
    expect(none({ pathname: '/marketplace/cart' })).toBeNull()
    expect(none({ pathname: '/api/public/facts' })).toBeNull()
    expect(none({ pathname: '/learn/rss.xml' })).toBeNull()
    expect(none({ pathname: '/og' })).toBeNull()
    expect(none({ headers: H({ rsc: '1' }) })).toBeNull()
    expect(none({ headers: H({ 'next-router-prefetch': '1' }) })).toBeNull()
    expect(none({ headers: H({ 'next-action': 'abc' }) })).toBeNull()
    expect(none({ method: 'POST' })).toBeNull()
    expect(none({ cookies: { has: (n: string) => n === '__prerender_bypass' } })).toBeNull()
    expect(none({ env: { PUBLIC_CDN_CACHE: '0' } })).toBeNull()
  })
})

describe('SEO-034: English-body pages', () => {
  it('forum threads and legal pages keep /hi /te copies but canonicalise to English, no hreflang', () => {
    for (const p of ['/privacy', '/terms', '/cookies', '/community/t/abc123', '/community/c/general']) {
      expect(isLocalizedPath(p), p).toBe(true)
      expect(isEnglishBodyPath(`/hi${p}`), p).toBe(true)
      expect(canonicalLocalePath(p, 'hi')).toBe(p)
      expect(hreflangAlternates(p)).toBeNull()
    }
    const m = buildMetadata({ title: 'Privacy', description: 'x', path: '/privacy', locale: 'te' })
    expect(m.alternates).toEqual({ canonical: '/privacy' })
    // Translated pages are unchanged.
    expect(canonicalLocalePath('/pricing', 'hi')).toBe('/hi/pricing')
    expect(hreflangAlternates('/pricing')).toMatchObject({ hi: '/hi/pricing', te: '/te/pricing', 'x-default': '/pricing' })
  })

  it('the sitemap lists English-body pages once', () => {
    expect(withLocalizedEntries([{ path: '/terms' }]).map((e) => e.path)).toEqual(['/terms'])
    expect(withLocalizedEntries([{ path: '/faq' }]).map((e) => e.path)).toEqual(['/faq', '/hi/faq', '/te/faq'])
  })
})

describe('SEO-035: job locations for Google for Jobs', () => {
  const job = (location: string, job_type = 'Full-time'): JobInput => ({ id: 'j1', title: 'SDE', company: 'Acme', location, job_type, description: 'Build things', salary: null, created_at: '2026-10-01T00:00:00Z', is_active: true })
  it('cleans cities and finds the country', () => {
    expect(parseJobLocation('Hybrid - Pune')).toMatchObject({ city: 'Pune', countries: ['IN'] })
    expect(parseJobLocation('New York')).toMatchObject({ city: 'New York', countries: ['US'] })
    expect(parseJobLocation('Anywhere')).toMatchObject({ remote: true, city: null, countries: [] })
    expect(parseJobLocation('Remote')).toMatchObject({ remote: true, city: null })
    expect(validateJsonLd(jobPostingJsonLd(job('New York'), 'https://x'))).toEqual([])
    expect(validateJsonLd(jobPostingJsonLd(job('Hybrid - Pune'), 'https://x'))).toEqual([])
  })
  it('a remote post with no country is invalid (the page leaves it out)', () => {
    expect(validateJsonLd(jobPostingJsonLd(job('Anywhere'), 'https://x'))).not.toEqual([])
    expect(validJsonLd([jobPostingJsonLd(job('Remote'), 'https://x')])).toEqual([])
  })
})

describe('SEO-036: new structured data', () => {
  it('forum thread → DiscussionForumPosting; locked solution (no text) is dropped', () => {
    const base = { site: 'https://x', path: '/community/t/1', headline: 'How to binary search?', author: 'Asha', datePublished: '2026-10-01T00:00:00Z', replies: [{ text: 'Use lo/hi', author: 'Ravi', datePublished: '2026-10-02T00:00:00Z' }] }
    const ok = discussionForumPostingJsonLd({ ...base, text: 'Question body' })
    expect(validateJsonLd(ok)).toEqual([])
    expect(ok.comment).toHaveLength(1)
    expect(validJsonLd([discussionForumPostingJsonLd({ ...base, text: null })])).toEqual([])
  })
  it('mentor → Person with Service offers in major units', () => {
    const p = mentorJsonLd({ site: 'https://x', path: '/mentors/a', name: 'A', headline: 'SDE', skills: ['Go'], offers: [{ name: 'Mock interview', price: 150000, currency: 'INR' }] })
    expect(validateJsonLd(p)).toEqual([])
    expect((p.makesOffer as { price: string }[])[0].price).toBe('1500.00')
  })
})

describe('SEO-037: llms facts', () => {
  it('describe the newer features and list every hub flagged for llms', () => {
    const facts = PRODUCT_FACTS.capabilities.join(' ')
    for (const w of ['contest', 'certification', 'mentor', 'league', 'Hindi', 'Telugu', 'interview simulator', 'video', 'Android']) expect(facts.toLowerCase()).toContain(w.toLowerCase())
    const txt = buildLlmsTxt({ site: 'https://x' })
    for (const r of PUBLIC_ROUTES.filter((r) => r.llms)) expect(txt, r.path).toContain(`(https://x${r.path})`)
    for (const p of ['/contests', '/community', '/certifications', '/leagues', '/mentors']) expect(txt).toContain(`(https://x${p})`)
    expect(txt).toContain('/news/rss.xml')
    expect(txt).toContain('/digest/rss.xml')
    expect(txt).toContain('(https://x/hi)')
  })
})

describe('SEO-030: OG cards never draw Indic text', () => {
  it('detects the script and swaps in Latin text', () => {
    expect(indicScript('मूल्य निर्धारण')).toBe('Hindi')
    expect(indicScript('ధరలు')).toBe('Telugu')
    expect(indicScript('Pricing')).toBeNull()
    expect(ogCardText({ title: 'मूल्य निर्धारण', fallbackTitle: 'Pricing' })).toEqual({ title: 'Pricing', subtitle: 'In Hindi' })
    expect(ogCardText({ title: 'Pricing', subtitle: 'x', fallbackTitle: 'y' })).toEqual({ title: 'Pricing', subtitle: 'x' })
  })
  it('buildMetadata signs a Latin card for a Hindi page', () => {
    const m = buildMetadata({ title: 'मूल्य निर्धारण', description: 'd', path: '/pricing', locale: 'hi' })
    const url = String((m.openGraph?.images as { url: string }[])[0].url)
    const q = new URLSearchParams(url.split('?')[1])
    expect(indicScript(q.get('title'))).toBeNull()
    expect(q.get('sub')).toBe('In Hindi')
  })
})

describe('SEO-028 / SEO-022: sitemap types and robots', () => {
  it('lists the new sections and blocks LTI launch links', () => {
    for (const t of ['contests', 'certifications', 'community', 'leagues', 'newsletter']) expect(SITEMAP_TYPES).toContain(t)
    expect(DISALLOWED_PATHS).toContain('/lti/')
  })
})

describe('SEO-032: Firebase only where it is needed', () => {
  it('signed-out visitors on public pages never load it', async () => {
    const { needsFirebaseSync } = await import('@/lib/auth-context')
    expect(needsFirebaseSync({ hasSession: false, pathname: '/', savedFirebaseLogin: false })).toBe(false)
    expect(needsFirebaseSync({ hasSession: false, pathname: '/hi/events', savedFirebaseLogin: false })).toBe(false)
    expect(needsFirebaseSync({ hasSession: true, pathname: '/', savedFirebaseLogin: false })).toBe(true)
    expect(needsFirebaseSync({ hasSession: false, pathname: '/', savedFirebaseLogin: true })).toBe(true)
    expect(needsFirebaseSync({ hasSession: false, pathname: '/auth/login', savedFirebaseLogin: false })).toBe(true)
    expect(needsFirebaseSync({ hasSession: false, pathname: '/dashboard', savedFirebaseLogin: false })).toBe(true)
  })
})

describe('SEO-031: /hi /te pages carry only the chrome catalogs', () => {
  it('layout catalogs exclude apiErrors and page copy; pages add theirs', async () => {
    const { publicClientMessages, publicPageMessages } = await import('@/lib/i18n/public-server')
    const hi = publicClientMessages('hi') as Record<string, unknown>
    expect(Object.keys(hi).sort()).toEqual(['common', 'errors', 'public'])
    expect(JSON.stringify(hi).length).toBeLessThan(60_000)
    expect(Object.keys(publicPageMessages('te', ['publicPages']))).toEqual(['publicPages'])
    expect(publicClientMessages('en')).toEqual({})
  })
})

/**
 * Locale-prefixed public URLs: path mapping, the language switcher target,
 * hreflang alternates (metadata + sitemap) and caching classification.
 * Run: npx vitest run tests/i18n-public-paths.test.ts
 */
import { describe, expect, it } from 'vitest'
import {
  hreflangAlternates,
  isLocalizedPath,
  isPrefixedLocale,
  localizedPath,
  sitemapAlternates,
  splitLocalePath,
  switchLocaleHref,
} from '@/lib/i18n/public-paths'
import { buildMetadata } from '@/lib/seo/metadata'
import { isPublicMarketingPath } from '@/lib/seo/public-routes'
import { buildUrlsetXml, withLocalizedEntries } from '@/lib/seo/sitemap'

const SITE = 'https://codespectra.ai'

describe('locale path mapping', () => {
  it('knows which pages are translated', () => {
    for (const p of ['/', '/pricing', '/features', '/learn', '/privacy', '/companies', '/companies/google', '/learn?category=dsa']) expect(isLocalizedPath(p), p).toBe(true)
    for (const p of ['/jobs', '/docs', '/dashboard', '/companies/Bad_Slug', '/learn/some-post', '/hackathons']) expect(isLocalizedPath(p), p).toBe(false)
    expect(isPrefixedLocale('hi')).toBe(true)
    expect(isPrefixedLocale('en')).toBe(false)
    expect(isPrefixedLocale('fr')).toBe(false)
  })

  it('splits the locale prefix off a path', () => {
    expect(splitLocalePath('/hi')).toEqual({ locale: 'hi', path: '/' })
    expect(splitLocalePath('/te/pricing')).toEqual({ locale: 'te', path: '/pricing' })
    expect(splitLocalePath('/hi?x=1')).toEqual({ locale: 'hi', path: '/?x=1' })
    expect(splitLocalePath('/hi/learn?category=dsa')).toEqual({ locale: 'hi', path: '/learn?category=dsa' })
    expect(splitLocalePath('/pricing')).toEqual({ locale: 'en', path: '/pricing' })
    // Words that merely start with "hi" / "te" are not prefixes.
    expect(splitLocalePath('/hiring')).toEqual({ locale: 'en', path: '/hiring' })
    expect(splitLocalePath('/terms')).toEqual({ locale: 'en', path: '/terms' })
  })

  it('builds localized URLs, keeping query and hash; English stays unprefixed', () => {
    expect(localizedPath('/', 'hi')).toBe('/hi')
    expect(localizedPath('/pricing', 'te')).toBe('/te/pricing')
    expect(localizedPath('/contact?topic=sales', 'hi')).toBe('/hi/contact?topic=sales')
    expect(localizedPath('/features#build', 'te')).toBe('/te/features#build')
    expect(localizedPath('/pricing', 'en')).toBe('/pricing')
    expect(localizedPath('/hi/pricing', 'en')).toBe('/pricing')
    // Untranslated pages keep their English URL in every language.
    expect(localizedPath('/jobs', 'hi')).toBe('/jobs')
    expect(localizedPath('/auth/signup', 'te')).toBe('/auth/signup')
  })

  it('language switcher maps / ↔ /hi ↔ /te and keeps the page', () => {
    expect(switchLocaleHref('/', 'hi')).toBe('/hi')
    expect(switchLocaleHref('/hi', 'te')).toBe('/te')
    expect(switchLocaleHref('/te', 'en')).toBe('/')
    expect(switchLocaleHref('/hi/pricing', 'en')).toBe('/pricing')
    expect(switchLocaleHref('/companies/google', 'te')).toBe('/te/companies/google')
    expect(switchLocaleHref('/hi/learn?category=dsa', 'te')).toBe('/te/learn?category=dsa')
    expect(switchLocaleHref('/jobs', 'hi')).toBe('/jobs')
  })
})

describe('hreflang', () => {
  it('lists en, hi, te and x-default for translated pages only', () => {
    expect(hreflangAlternates('/pricing')).toEqual({ en: '/pricing', hi: '/hi/pricing', te: '/te/pricing', 'x-default': '/pricing' })
    expect(hreflangAlternates('/hi')).toEqual({ en: '/', hi: '/hi', te: '/te', 'x-default': '/' })
    expect(hreflangAlternates('/te/companies/google')?.hi).toBe('/hi/companies/google')
    expect(hreflangAlternates('/jobs')).toBeNull()
  })

  it('buildMetadata: canonical per locale, alternates, Open Graph locale', () => {
    const en = buildMetadata({ title: 'Pricing', description: 'd', path: '/pricing' })
    expect(en.alternates?.canonical).toBe('/pricing')
    expect(en.alternates?.languages).toEqual({ en: '/pricing', hi: '/hi/pricing', te: '/te/pricing', 'x-default': '/pricing' })
    expect(en.openGraph?.locale).toBe('en_US')

    const hi = buildMetadata({ title: 'प्राइसिंग', description: 'd', path: '/pricing', locale: 'hi' })
    expect(hi.alternates?.canonical).toBe('/hi/pricing')
    expect(hi.alternates?.languages).toEqual(en.alternates?.languages)
    expect(hi.openGraph?.locale).toBe('hi_IN')
    expect(hi.openGraph?.url).toBe('/hi/pricing')

    // canonicalPath drops query strings, so a filter variant canonicalises to the localized hub.
    const cat = buildMetadata({ title: 't', description: 'd', path: '/learn', canonical: '/learn?category=dsa', locale: 'te' })
    expect(cat.alternates?.canonical).toBe('/te/learn')
    expect(cat.alternates?.languages?.hi).toBe('/hi/learn')
    // A canonical pointing at another page carries no hreflang.
    const dup = buildMetadata({ title: 't', description: 'd', path: '/pricing', canonical: '/features' })
    expect(dup.alternates).toEqual({ canonical: '/features' })

    // Untranslated pages: unchanged.
    const jobs = buildMetadata({ title: 'Jobs', description: 'd', path: '/jobs' })
    expect(jobs.alternates).toEqual({ canonical: '/jobs' })
  })

  it('sitemap lists /hi and /te copies with xhtml:link alternates', () => {
    const entries = withLocalizedEntries([{ path: '/pricing', lastmod: '2026-10-19' }, { path: '/jobs' }])
    expect(entries.map((e) => e.path)).toEqual(['/pricing', '/hi/pricing', '/te/pricing', '/jobs'])
    expect(entries[1].lastmod).toBe('2026-10-19')
    expect(sitemapAlternates('/te/pricing', SITE)).toContainEqual({ hreflang: 'x-default', href: `${SITE}/pricing` })
    const xml = buildUrlsetXml(entries, SITE)
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(xml).toContain(`<loc>${SITE}/hi/pricing</loc>`)
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="te" href="${SITE}/te/pricing"/>`)
    expect(xml.match(/<url>/g)).toHaveLength(4)
    // The /jobs row has no alternates.
    expect(xml).toMatch(new RegExp(`<loc>${SITE}/jobs</loc></url>`))
  })
})

describe('caching', () => {
  it('Hindi / Telugu copies are public, cacheable pages (static CSP, no CSRF cookie)', () => {
    for (const p of ['/hi', '/te/pricing', '/hi/companies/google', '/te/learn']) expect(isPublicMarketingPath(p), p).toBe(true)
    for (const p of ['/hi/dashboard', '/te/jobs', '/hi/unknown']) expect(isPublicMarketingPath(p), p).toBe(false)
  })
})

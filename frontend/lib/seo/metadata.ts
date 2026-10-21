/**
 * Metadata builders for public pages. Every public page goes through
 * buildMetadata() so it gets: a unique title (≤ 60 chars incl. brand), a
 * description clamped to ≤ 160 chars, a canonical URL, full Open Graph and
 * Twitter cards (child metadata replaces the parent's openGraph object, so we
 * always emit the whole thing) and a branded OG image from /og.
 *
 * Relative URLs resolve against metadataBase (set in app/layout.tsx).
 */
import type { Metadata } from 'next'
import { SITE_NAME } from './site'
import { signOg } from './og-sign'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'
import { hreflangAlternates, localizedPath } from '@/lib/i18n/public-paths'

export const TITLE_MAX = 60
export const DESCRIPTION_MAX = 160

export type OgKind = 'default' | 'page' | 'article' | 'job' | 'event' | 'hackathon' | 'product' | 'docs' | 'company' | 'compare' | 'certificate'

/** Cut at a word boundary and add an ellipsis when over `max`. */
export function clampText(input: string, max: number): string {
  const s = (input || '').replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:—–-]+$/, '')}…`
}

/** "Page | CodeSpectra" within 60 chars; drops the brand suffix before truncating the page title. */
export function pageTitle(title: string): string {
  const t = (title || '').replace(/\s+/g, ' ').trim()
  if (!t) return SITE_NAME
  if (t.includes(SITE_NAME)) return clampText(t, TITLE_MAX)
  const withBrand = `${t} | ${SITE_NAME}`
  return withBrand.length <= TITLE_MAX ? withBrand : clampText(t, TITLE_MAX)
}

/** Path of the dynamic brand OG image (app/og/route.tsx), HMAC-signed (W4-12). */
export function ogImagePath(args: { title: string; kind?: OgKind; subtitle?: string }): string {
  const p = new URLSearchParams()
  const title = clampText(args.title, 110)
  const kind = args.kind && args.kind !== 'default' ? args.kind : ''
  const sub = args.subtitle ? clampText(args.subtitle, 120) : ''
  p.set('title', title)
  if (kind) p.set('kind', kind)
  if (sub) p.set('sub', sub)
  p.set('s', signOg({ title, kind, sub }))
  return `/og?${p.toString()}`
}

export interface PageMetaInput {
  title: string
  description: string
  /** Path starting with "/" (canonical); query strings are dropped. */
  path: string
  kind?: OgKind
  /** Explicit image (absolute or relative). Defaults to the generated /og card. */
  image?: string | null
  imageAlt?: string
  ogSubtitle?: string
  type?: 'website' | 'article' | 'profile'
  publishedTime?: string | null
  modifiedTime?: string | null
  section?: string
  tags?: string[]
  keywords?: string[]
  /** noindex,follow (filter pages) or noindex,nofollow (private). */
  noIndex?: boolean | 'follow'
  /** Canonical to another URL (duplicates, e.g. an internal hackathon's /events page). */
  canonical?: string
  /**
   * Language of this copy (default English). `path` / `canonical` stay the
   * unprefixed English URL; a Hindi / Telugu page gets /hi/… or /te/… as its
   * canonical. Pages with translations (lib/i18n/public-paths.ts) get
   * hreflang alternates for en, hi, te and x-default automatically.
   */
  locale?: Locale
}

export function canonicalPath(path: string): string {
  const p = (path || '/').split('#')[0].split('?')[0]
  if (!p.startsWith('/') && !/^https?:\/\//.test(p)) return `/${p}`
  return p.length > 1 ? p.replace(/\/+$/, '') : p
}

export function buildMetadata(input: PageMetaInput): Metadata {
  const title = pageTitle(input.title)
  const description = clampText(input.description, DESCRIPTION_MAX)
  const locale = input.locale ?? 'en'
  const canonical = localizedPath(canonicalPath(input.canonical || input.path), locale)
  // hreflang only on the page itself, not on filter variants with their own canonical.
  const languages = !input.canonical || canonicalPath(input.canonical) === canonicalPath(input.path) ? hreflangAlternates(input.path) : null
  const image = input.image || ogImagePath({ title: input.title, kind: input.kind ?? 'page', subtitle: input.ogSubtitle })
  const images = [{ url: image, width: 1200, height: 630, alt: input.imageAlt || input.title }]
  const robots: Metadata['robots'] = input.noIndex
    ? { index: false, follow: input.noIndex === 'follow' }
    : { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 }
  return {
    title: { absolute: title },
    description,
    ...(input.keywords?.length ? { keywords: input.keywords.slice(0, 15) } : {}),
    alternates: languages ? { canonical, languages } : { canonical },
    robots,
    openGraph: {
      type: input.type ?? 'website',
      siteName: SITE_NAME,
      locale: LOCALE_META[locale].og,
      ...(languages ? { alternateLocale: (Object.keys(LOCALE_META) as Locale[]).filter((l) => l !== locale).map((l) => LOCALE_META[l].og) } : {}),
      title: clampText(input.title, 90),
      description,
      url: canonical,
      images,
      ...(input.type === 'article'
        ? {
            publishedTime: input.publishedTime ?? undefined,
            modifiedTime: input.modifiedTime ?? undefined,
            section: input.section,
            tags: input.tags,
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: clampText(input.title, 70),
      description,
      images: [image],
    },
  }
}

/** Private / token pages: never indexed, never leak the URL via Referer. */
export const PRIVATE_PAGE_METADATA: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
}

export function privateMetadata(title: string): Metadata {
  return { title: { absolute: `${title} | ${SITE_NAME}` }, ...PRIVATE_PAGE_METADATA }
}

import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Providers } from '@/components/providers'
import { LoadingWrapper } from '@/components/loading-wrapper'
import { AnalyticsMount } from '@/components/analytics/analytics-mount'
import './globals.css'
import 'goey-toast/styles.css'
import 'driver.js/dist/driver.css'
import 'driver.js/dist/hints.css'
import './driver-tour.css'
import { JsonLd } from '@/components/seo/json-ld'
import { getSeoSettings } from '@/lib/seo/settings'
import { resolveSiteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/seo/site'
import { ogImagePath } from '@/lib/seo/metadata'
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/jsonld'
import { THEME_INIT_SCRIPT } from '@/lib/csp/inline-scripts'
import { expireSoonIfBuilding } from '@/lib/cache/build-phase'

// Wave 7: no app-wide `force-dynamic` any more. Public marketing / content
// pages are static or ISR (they read no cookies or session — user state lives
// in client components); the signed-in app, auth, test-taking and token-link
// segments opt into per-request rendering in their own layouts (needed for the
// CSP nonce — lib/csp/policy.ts; tests/csp-dynamic-routes.test.ts guards it).
// Upper bound for every cached page; listings set shorter windows and publish
// actions revalidate on demand (lib/cache/revalidate.ts).
export const revalidate = 3600

// Self-hosted JetBrains Mono (variable font, latin subset). Previously
// `next/font/google` which failed the Docker build when the server couldn't
// reach fonts.gstatic.com. The woff2 is a variable font covering 100–800.
const mono = localFont({
  src: '../fonts/jetbrains-mono-latin.woff2',
  variable: '--font-mono',
  display: 'swap',
})

// Archivo variable (wght 100–900, wdth 62–125). Self-hosted for the same Docker
// reason as JetBrains Mono. Used by public marketing + auth pages via `font-archivo`.
const archivo = localFont({
  src: '../fonts/archivo-latin-variable.woff2',
  variable: '--font-archivo',
  display: 'swap',
  weight: '100 900',
})

// Plus Jakarta Sans variable (wght 200–800): app-wide UI and body text.
const jakarta = localFont({
  src: '../fonts/plus-jakarta-sans-latin-variable.woff2',
  variable: '--font-jakarta',
  display: 'swap',
  weight: '200 800',
})

/**
 * Site-wide SEO defaults (lib/seo). metadataBase makes every relative
 * canonical / og:url / og:image absolute on the public origin (never
 * localhost). Pages override title/description/canonical/openGraph through
 * buildMetadata(); the title template covers pages that only set a string.
 */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettings()
  const site = resolveSiteUrl(seo.site_url)
  const ogImage = seo.default_og_image || ogImagePath({ title: SITE_TAGLINE, kind: 'default' })
  const verificationOther: Record<string, string> = {}
  if (seo.verification.bing) verificationOther['msvalidate.01'] = seo.verification.bing
  return {
    metadataBase: new URL(site),
    title: { default: `${SITE_NAME}: ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
      title: `${SITE_NAME}: ${SITE_TAGLINE}`,
      description: SITE_DESCRIPTION,
      images: [{ url: ogImage, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: { card: 'summary_large_image', title: `${SITE_NAME}: ${SITE_TAGLINE}`, description: SITE_DESCRIPTION, images: [ogImage] },
    verification: {
      ...(seo.verification.google ? { google: seo.verification.google } : {}),
      ...(seo.verification.yandex ? { yandex: seo.verification.yandex } : {}),
      ...(Object.keys(verificationOther).length ? { other: verificationOther } : {}),
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      // iOS ignores SVG touch icons: PNG, full-bleed (iOS rounds the corners).
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    manifest: '/manifest.webmanifest',
  }
}

export const viewport = { width: 'device-width', initialScale: 1 }

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Pages prerendered during `next build` had no database: expire them on the
  // first request so admin SEO settings, analytics ids and listings appear.
  await expireSoonIfBuilding()
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${mono.variable} ${archivo.variable} ${jakarta.variable}`}
    >
      <body
        className="antialiased bg-background text-foreground font-sans"
        suppressHydrationWarning
      >
        {/* Allowed by hash in the strict CSP (lib/csp/inline-scripts.ts). */}
        <script id="theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <SiteJsonLd />
        <Providers>
          <LoadingWrapper>{children}</LoadingWrapper>
          <AnalyticsMount />
        </Providers>
      </body>
    </html>
  )
}

/** Organization + WebSite (with SearchAction) on every page. */
async function SiteJsonLd() {
  const seo = await getSeoSettings()
  const site = resolveSiteUrl(seo.site_url)
  return (
    <JsonLd
      data={[
        organizationJsonLd({
          site,
          legalName: seo.organization.legal_name,
          logoUrl: seo.organization.logo_url || undefined,
          sameAs: seo.social_profiles,
          email: seo.organization.email || undefined,
          locations: seo.organization.locations,
          foundingYear: seo.organization.founding_year || undefined,
        }),
        websiteJsonLd(site),
      ]}
    />
  )
}

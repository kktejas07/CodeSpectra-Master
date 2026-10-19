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

// Kept app-wide: dashboard client pages read search params without Suspense
// and must not be prerendered at build (no DB at build time). Public pages
// still get full server HTML (components/providers.tsx renders children on
// the server) and CDN-cacheable responses (proxy.ts skips the CSRF cookie on
// public marketing paths). SEO-004: revisit when the dashboard opts in per segment.
export const dynamic = 'force-dynamic'

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
      icon: '/icon.svg',
      apple: '/apple-icon.svg',
    },
  }
}

export const viewport = { width: 'device-width', initialScale: 1 }

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                var t = 'dark';
                try { t = localStorage.getItem('theme') || 'dark'; } catch (e) {}
                if (t === 'system') {
                  t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
                document.documentElement.classList.add(t);
              })();
            `,
          }}
        />
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

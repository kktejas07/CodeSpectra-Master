import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { HeroIllustration, PageHero, btnSecondary } from '@/components/landing/page-hero'
import { buildMetadata } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'

const seoRoute = publicRoute('/api-reference')!
export const metadata = buildMetadata({ title: seoRoute.title, description: seoRoute.description, path: '/api-reference' })

const code = 'rounded-md bg-cs-accent/8 px-1.5 py-0.5 font-mono text-[13px] text-cs-ink'
const link = 'font-medium text-cs-accent-text underline-offset-4 hover:underline'

export default function ApiReferencePage() {
  return (
    <PublicPageWrapper>
      <PageHero
        title="API reference"
        lead={
          <>
            CodeSpectra exposes authenticated JSON routes under <code className={code}>/api/*</code>.
            This page summarizes the main surfaces; open each route in your repo for request/response shapes.
          </>
        }
        actions={
          <Link href="/docs" className={btnSecondary}>
            Back to documentation
          </Link>
        }
        art={<HeroIllustration name="domain-code" />}
      />

      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[200px_1fr] lg:gap-16 lg:px-8 lg:py-20">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 text-sm">
            {[
              ['#auth', 'Authentication'],
              ['#analyze', 'Code analysis'],
              ['#webhooks', 'Webhooks and integrations'],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={href} className="block rounded-lg px-3 py-2 font-medium text-cs-ink-soft transition-colors hover:bg-cs-accent/10 hover:text-cs-accent-text">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-[72ch] space-y-12 text-[15px] leading-7 text-cs-ink-soft">
          <section id="auth" className="scroll-mt-24 space-y-3">
            <h2 className="border-b border-cs-grid pb-2 text-2xl font-bold tracking-tight text-cs-ink">Authentication</h2>
            <p>
              Dashboard and most APIs expect an authenticated session (cookies). Use{' '}
              <Link href="/auth/login" className={link}>
                Sign in
              </Link>{' '}
              from the app; server routes use <code className={code}>requireAuth()</code> where applicable.
            </p>
          </section>

          <section id="analyze" className="scroll-mt-24 space-y-3">
            <h2 className="border-b border-cs-grid pb-2 text-2xl font-bold tracking-tight text-cs-ink">Code analysis</h2>
            <ul className="divide-y divide-cs-grid overflow-hidden rounded-2xl border border-cs-grid bg-cs-sheet">
              {[
                ['POST', '/api/analyze-code', 'submit source for analysis'],
                ['POST', '/api/generate-fixes', 'AI-assisted fix suggestions'],
                ['GET', '/api/scanner/*', 'scanner metrics and issues (session)'],
              ].map(([method, path, desc]) => (
                <li key={path} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-12 shrink-0 rounded-md bg-cs-accent/10 py-0.5 text-center font-mono text-xs font-semibold text-cs-accent-text">{method}</span>
                  <code className="font-mono text-sm text-cs-ink">{path}</code>
                  <span className="text-sm">— {desc}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="webhooks" className="scroll-mt-24 space-y-3">
            <h2 className="border-b border-cs-grid pb-2 text-2xl font-bold tracking-tight text-cs-ink">Webhooks &amp; integrations</h2>
            <p>
              GitHub OAuth and integration routes live under <code className={code}>/api/github/*</code> and{' '}
              <code className={code}>/api/integrations/*</code>. Configure redirect URLs in your provider console to match
              your deployment host.
            </p>
          </section>

          <p>
            <Link href="/docs" className={link}>
              Back to documentation
            </Link>
          </p>
        </div>
      </div>
    </PublicPageWrapper>
  )
}

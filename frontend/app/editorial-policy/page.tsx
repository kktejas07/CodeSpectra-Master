/**
 * /editorial-policy — E-E-A-T page: how published content is written, sourced,
 * reviewed and corrected, and who is responsible. The team list comes from
 * Admin → Settings → SEO & AI search (no invented people).
 */
import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { JsonLd } from '@/components/seo/json-ld'
import { AnswerSummary, SPEAKABLE_SELECTORS } from '@/components/seo/answer-summary'
import { buildMetadata } from '@/lib/seo/metadata'
import { compact, orgId, webPageJsonLd } from '@/lib/seo/jsonld'
import { publicRoute } from '@/lib/seo/public-routes'
import { getSeoSettings } from '@/lib/seo/settings'
import { resolveSiteUrl } from '@/lib/seo/site'

const route = publicRoute('/editorial-policy')!
export const metadata = buildMetadata({ title: route.title, description: route.description, path: '/editorial-policy' })

const STEPS: { term: string; detail: string }[] = [
  { term: 'Sources first', detail: 'Each Learn post starts from reference pages (official documentation, specifications, textbooks and well-known engineering writing). The pages used are listed at the end of the post.' },
  { term: 'Written in our own words', detail: 'Posts are drafted by the CodeSpectra learning bot from those sources. It is instructed to explain, not copy, and to open with a direct answer, key takeaways and an FAQ.' },
  { term: 'Automated checks', detail: 'Every draft is checked for code syntax, sensible complexity tables, text copied from the reference pages and sources outside our allowlist, and duplicate topics are refused. The result is a quality score shown to the editor.' },
  { term: 'Human review', detail: 'Editors can approve, edit, schedule, reject or withdraw any post. Posts above a quality threshold may be published automatically when an administrator turns that on; editors still review them afterwards.' },
  { term: 'Corrections', detail: 'Found a mistake? Email the address below with the page link. We correct errors and update the post’s modified date; serious errors are noted at the top of the post.' },
  { term: 'Independence', detail: 'Learn posts are not sponsored. Product mentions are limited to practice links on CodeSpectra. Comparison pages list their sources and are updated when either product changes.' },
]

export default async function EditorialPolicyPage() {
  const seo = await getSeoSettings()
  const site = resolveSiteUrl(seo.site_url)
  const contact = seo.organization.email || 'support@codespectra.ai'
  const team = seo.editorial_team
  return (
    <PublicPageWrapper>
      <JsonLd
        data={{
          ...webPageJsonLd({ site, path: '/editorial-policy', name: route.title, description: route.description, speakable: SPEAKABLE_SELECTORS, type: 'AboutPage' }),
          about: { '@id': orgId(site) },
          ...(team.length
            ? { author: team.map((m) => compact({ '@type': 'Person', name: m.name, jobTitle: m.role, description: m.bio, url: m.url || undefined, worksFor: { '@id': orgId(site) } })) }
            : {}),
        }}
      />
      <PageHero title="Editorial policy" lead="How we write, source, review and correct what we publish on CodeSpectra Learn and across the site." />
      <div className="mx-auto max-w-[900px] space-y-12 px-4 py-12 sm:px-6 lg:px-8">
        <Breadcrumbs site={site} items={[{ name: 'Editorial policy', path: '/editorial-policy' }]} />
        <AnswerSummary
          answer="Learn posts are written by our learning bot from cited sources, checked automatically, and reviewed, corrected or withdrawn by CodeSpectra editors. Sources are listed on every post and corrections are welcome."
        />
        <section aria-labelledby="process-heading">
          <h2 id="process-heading" className="cs-heading text-3xl">How a post is made</h2>
          <dl className="mt-6 space-y-6">
            {STEPS.map((s) => (
              <div key={s.term} className="border-l-2 border-cs-accent pl-4">
                <dt className="font-semibold text-cs-ink">{s.term}</dt>
                <dd className="mt-1 max-w-[70ch] leading-relaxed text-cs-ink-soft">{s.detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="team-heading">
          <h2 id="team-heading" className="cs-heading text-3xl">Who is responsible</h2>
          {team.length ? (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {team.map((m) => (
                <li key={m.name} className="rounded-3xl border border-cs-grid bg-cs-sheet p-5">
                  <p className="font-semibold text-cs-ink">{m.url ? <a href={m.url} rel="noopener" className="hover:underline">{m.name}</a> : m.name}</p>
                  {m.role ? <p className="text-sm text-cs-accent-text">{m.role}</p> : null}
                  {m.bio ? <p className="mt-2 text-sm leading-relaxed text-cs-ink-soft">{m.bio}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 max-w-[70ch] leading-relaxed text-cs-ink-soft">
              The CodeSpectra team at AXISS Group is responsible for everything published here. Learn more on the{' '}
              <Link href="/about" className="font-semibold text-cs-accent-text underline underline-offset-4">About page</Link>.
            </p>
          )}
        </section>

        <section aria-labelledby="contact-heading" className="rounded-3xl border border-cs-grid bg-cs-sheet p-6">
          <h2 id="contact-heading" className="text-xl font-bold text-cs-ink">Report an error</h2>
          <p className="mt-2 text-cs-ink-soft">
            Email <a className="font-semibold text-cs-accent-text underline underline-offset-4" href={`mailto:${contact}`}>{contact}</a> with the page link and what is wrong.
          </p>
        </section>
      </div>
    </PublicPageWrapper>
  )
}

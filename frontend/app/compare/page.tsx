/** /compare — index of published comparison pages (noindex while there are none). */
import type { Metadata } from 'next'
import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { buildMetadata } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'
import { getSeoSettings } from '@/lib/seo/settings'

export const dynamic = 'force-dynamic'

const route = publicRoute('/compare')!

export async function generateMetadata(): Promise<Metadata> {
  const any = (await getSeoSettings()).comparisons.some((c) => c.published)
  return buildMetadata({ title: route.title, description: route.description, path: '/compare', kind: 'compare', noIndex: any ? false : 'follow' })
}

export default async function CompareIndexPage() {
  const list = (await getSeoSettings()).comparisons.filter((c) => c.published)
  return (
    <PublicPageWrapper>
      <PageHero title="CodeSpectra compared" lead="Side-by-side comparisons with other assessment and hiring tools. Every competitor fact links to its source." />
      <div className="mx-auto max-w-[1000px] px-4 py-12 sm:px-6 lg:px-8">
        {list.length ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {list.map((c) => (
              <li key={c.slug} className="rounded-3xl border border-cs-grid bg-cs-sheet p-5">
                <h2 className="text-lg font-semibold text-cs-ink"><Link href={`/compare/${c.slug}`} className="hover:underline">CodeSpectra vs {c.competitor}</Link></h2>
                {c.summary ? <p className="mt-2 text-sm text-cs-ink-soft">{c.summary}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No comparisons yet" description="We publish comparisons only once every claim has a source." actionLabel="See all features" actionHref="/features" />
        )}
      </div>
    </PublicPageWrapper>
  )
}

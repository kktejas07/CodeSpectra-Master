/** /compare/<slug> — admin-written "CodeSpectra vs X" page (unpublished or unknown → 404). */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { ComparisonPageView } from '@/components/seo/comparison-page'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { JsonLd } from '@/components/seo/json-ld'
import { buildMetadata, ogImagePath } from '@/lib/seo/metadata'
import { articleJsonLd } from '@/lib/seo/jsonld'
import { getSeoSettings } from '@/lib/seo/settings'
import { resolveSiteUrl } from '@/lib/seo/site'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

async function load(slug: string) {
  const seo = await getSeoSettings()
  return { seo, c: seo.comparisons.find((x) => x.slug === slug && x.published) || null }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { c } = await load((await params).slug)
  if (!c) return { title: 'Comparison not found', robots: { index: false } }
  return buildMetadata({
    title: `CodeSpectra vs ${c.competitor}`,
    description: c.summary || `How CodeSpectra compares with ${c.competitor}: features, fit and sources.`,
    path: `/compare/${c.slug}`,
    kind: 'compare',
    type: 'article',
    modifiedTime: c.updated_at,
  })
}

export default async function ComparePage({ params }: { params: Params }) {
  const { seo, c } = await load((await params).slug)
  if (!c) notFound()
  const site = resolveSiteUrl(seo.site_url)
  return (
    <PublicPageWrapper>
      <JsonLd
        data={articleJsonLd({
          site,
          type: 'Article',
          path: `/compare/${c.slug}`,
          headline: `CodeSpectra vs ${c.competitor}`,
          description: c.summary,
          datePublished: c.updated_at,
          dateModified: c.updated_at,
          image: ogImagePath({ title: `CodeSpectra vs ${c.competitor}`, kind: 'compare' }),
          citations: c.sources,
        })}
      />
      <PageHero title={`CodeSpectra vs ${c.competitor}`} lead={`An honest, sourced comparison to help you choose between CodeSpectra and ${c.competitor}.`} />
      <div className="mx-auto max-w-[1000px] px-4 pt-8 sm:px-6 lg:px-8">
        <Breadcrumbs site={site} items={[{ name: 'Compare', path: '/compare' }, { name: `vs ${c.competitor}`, path: `/compare/${c.slug}` }]} />
      </div>
      <ComparisonPageView c={c} />
    </PublicPageWrapper>
  )
}

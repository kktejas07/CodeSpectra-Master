/**
 * /contests/<slug> — contest detail: brief, schedule, how scoring works,
 * register (solo or team), live leaderboard. Server shell for metadata;
 * drafts are noindex and load client-side for staff only.
 */
import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { PublicPageWrapper } from '@/app/public-layout'
import { ContestDetail } from '@/components/contests/contest-detail'
import { contestPhase } from '@/lib/contests/config'
import { FORMATS } from '@/lib/contests/formats'
import { findContest, publicContest } from '@/lib/contests/service'
import { buildMetadata, clampText } from '@/lib/seo/metadata'
import { JsonLd } from '@/components/seo/json-ld'
import { breadcrumbJsonLd, eventJsonLd, validJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

// undefined = the DB read failed (client path retries); null = no such contest.
const load = cache(async (slug: string) => {
  try { return await findContest(slug) } catch { return undefined }
})

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const c = await load(slug)
  if (!c || c.status === 'draft') return { title: 'Contest', robots: { index: false, follow: true } }
  const label = FORMATS[c.format].label
  return buildMetadata({
    title: `${c.title}: ${label}`,
    description: c.summary || `${c.title} is a ${label.toLowerCase()} on CodeSpectra. ${FORMATS[c.format].description}`,
    path: `/contests/${c.slug}`,
    kind: 'hackathon',
    image: c.banner_url || undefined,
    noIndex: c.visibility === 'unlisted' ? 'follow' : undefined,
  })
}

export default async function ContestPage({ params }: { params: Params }) {
  const { slug } = await params
  const c = await load(slug)
  // SEO-023: a wrong or deleted link is a real 404, not "Contest not found" with 200.
  // Drafts keep the client path (the API shows them to staff only).
  if (c === null) notFound()
  const initial = c && c.status !== 'draft' ? JSON.parse(JSON.stringify({ contest: publicContest(c), phase: contestPhase(c) })) : null
  // SEO-036: Event + breadcrumb for published public contests (unlisted / drafts get none).
  const schema = c && c.status !== 'draft' && c.visibility !== 'unlisted' ? await contestSchema(c) : []
  return (
    <PublicPageWrapper>
      <JsonLd data={schema} />
      <ContestDetail slug={slug} initial={initial} />
    </PublicPageWrapper>
  )
}

async function contestSchema(c: NonNullable<Awaited<ReturnType<typeof findContest>>>) {
  const site = await getSiteOrigin()
  const path = `/contests/${c.slug}`
  return validJsonLd([
    eventJsonLd({
      name: c.title,
      description: clampText(c.summary || c.description || `${c.title}: ${FORMATS[c.format].label} on CodeSpectra`, 500),
      startsAt: c.schedule.starts_at,
      endsAt: c.schedule.ends_at,
      mode: 'online',
      url: `${site}${path}`,
      pageUrl: path,
      organiser: 'CodeSpectra',
      organiserUrl: site,
      image: c.banner_url || null,
      free: true,
      registrationDeadline: c.schedule.registration_closes_at || null,
    }, site),
    breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Contests', path: '/contests' }, { name: c.title, path }], site),
  ])
}

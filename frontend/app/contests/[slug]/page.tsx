/**
 * /contests/<slug> — contest detail: brief, schedule, how scoring works,
 * register (solo or team), live leaderboard. Server shell for metadata;
 * drafts are noindex and load client-side for staff only.
 */
import type { Metadata } from 'next'
import { cache } from 'react'
import { PublicPageWrapper } from '@/app/public-layout'
import { ContestDetail } from '@/components/contests/contest-detail'
import { contestPhase } from '@/lib/contests/config'
import { FORMATS } from '@/lib/contests/formats'
import { findContest, publicContest } from '@/lib/contests/service'
import { buildMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'

type Params = Promise<{ slug: string }>

const load = cache(async (slug: string) => {
  try { return await findContest(slug) } catch { return null }
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
  const initial = c && c.status !== 'draft' ? JSON.parse(JSON.stringify({ contest: publicContest(c), phase: contestPhase(c) })) : null
  return (
    <PublicPageWrapper>
      <ContestDetail slug={slug} initial={initial} />
    </PublicPageWrapper>
  )
}

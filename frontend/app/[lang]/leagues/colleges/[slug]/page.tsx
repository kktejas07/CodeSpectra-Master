import type { Metadata } from 'next'
import { CollegeLeagueView, collegeLeagueMetadata } from '@/app/leagues/colleges/[slug]/college-view'
import { langOf } from '@/lib/i18n/public-page'

// SEO-047: one college on the university league in Hindi / Telugu.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params
  return collegeLeagueMetadata(p.slug, await langOf(Promise.resolve(p)))
}

export default async function Page({ params }: Props) {
  const p = await params
  return <CollegeLeagueView slug={p.slug} locale={await langOf(Promise.resolve(p))} />
}

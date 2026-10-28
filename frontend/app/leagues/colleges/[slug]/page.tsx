import type { Metadata } from 'next'
import { CollegeLeagueView, collegeLeagueMetadata } from './college-view'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return collegeLeagueMetadata((await params).slug, 'en')
}

export default async function CollegeLeaguePage({ params }: Props) {
  return <CollegeLeagueView slug={(await params).slug} locale="en" />
}

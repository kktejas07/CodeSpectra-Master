import type { Metadata } from 'next'
import { MentorsView, mentorsMetadata, type SP } from './mentors-view'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  return mentorsMetadata(searchParams, 'en')
}

export default function MentorsPage({ searchParams }: { searchParams: SP }) {
  return <MentorsView searchParams={searchParams} locale="en" />
}

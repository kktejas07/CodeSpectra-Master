import type { Metadata } from 'next'
import { MentorsView, mentorsMetadata, type SP } from '@/app/mentors/mentors-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

// Same caching as the English page (per request; filters come from searchParams).
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }: { params: LangParams; searchParams: SP }): Promise<Metadata> {
  return mentorsMetadata(searchParams, await langOf(params))
}

export default async function Page({ params, searchParams }: { params: LangParams; searchParams: SP }) {
  return <MentorsView searchParams={searchParams} locale={await langOf(params)} />
}

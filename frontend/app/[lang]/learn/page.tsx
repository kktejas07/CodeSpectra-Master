import type { Metadata } from 'next'
import { LearnView, learnMetadata, type SP } from '@/app/learn/learn-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

// Same caching as the English page (per request; filters come from searchParams).
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }: { params: LangParams; searchParams: SP }): Promise<Metadata> {
  return learnMetadata(searchParams, await langOf(params))
}

export default async function Page({ params, searchParams }: { params: LangParams; searchParams: SP }) {
  return <LearnView searchParams={searchParams} locale={await langOf(params)} />
}

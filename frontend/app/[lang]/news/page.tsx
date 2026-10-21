import type { Metadata } from 'next'
import { NewsView, newsMetadata, type SP } from '@/app/news/news-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

// Same caching as the English page (per request; filters come from searchParams).
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }: { params: LangParams; searchParams: SP }): Promise<Metadata> {
  return newsMetadata(searchParams, await langOf(params))
}

export default async function Page({ params, searchParams }: { params: LangParams; searchParams: SP }) {
  return <NewsView searchParams={searchParams} locale={await langOf(params)} />
}

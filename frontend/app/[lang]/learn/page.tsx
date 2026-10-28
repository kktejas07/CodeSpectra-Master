import type { Metadata } from 'next'
import { LearnView, learnMetadata, type SP } from '@/app/learn/learn-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'
import { PublicPageI18n } from '@/components/i18n/public-page-i18n'

// Same caching as the English page (per request; filters come from searchParams).
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }: { params: LangParams; searchParams: SP }): Promise<Metadata> {
  return learnMetadata(searchParams, await langOf(params))
}

export default async function Page({ params, searchParams }: { params: LangParams; searchParams: SP }) {
  const locale = await langOf(params)
  return <PublicPageI18n locale={locale} ns={['learn']}><LearnView searchParams={searchParams} locale={locale} /></PublicPageI18n>
}

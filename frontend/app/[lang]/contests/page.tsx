import { ContestsView, contestsMetadata } from '@/app/contests/contests-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'
import { PublicPageI18n } from '@/components/i18n/public-page-i18n'

// Same caching as the English page (per request from the tag-purged data cache).
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: LangParams }) {
  return contestsMetadata(await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  const locale = await langOf(params)
  return <PublicPageI18n locale={locale} ns={['publicPages']}><ContestsView locale={locale} /></PublicPageI18n>
}

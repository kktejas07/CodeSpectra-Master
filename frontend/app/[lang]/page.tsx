import { LandingView, landingMetadata } from '@/app/landing-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'
import { PublicPageI18n } from '@/components/i18n/public-page-i18n'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: LangParams }) {
  return landingMetadata(await langOf(params))
}

export default async function LocalizedHome({ params }: { params: LangParams }) {
  const locale = await langOf(params)
  return <PublicPageI18n locale={locale} ns={['learn']}><LandingView locale={locale} /></PublicPageI18n>
}

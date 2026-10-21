import { LandingView, landingMetadata } from '@/app/landing-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: LangParams }) {
  return landingMetadata(await langOf(params))
}

export default async function LocalizedHome({ params }: { params: LangParams }) {
  return <LandingView locale={await langOf(params)} />
}

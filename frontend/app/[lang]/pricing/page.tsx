import { PricingView, pricingMetadata } from '@/app/pricing/pricing-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

// Same caching as the English page (per request from the tag-purged data cache).
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: LangParams }) {
  return pricingMetadata(await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  return <PricingView locale={await langOf(params)} />
}

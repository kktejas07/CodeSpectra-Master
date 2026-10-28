import { PricingView, pricingMetadata } from './pricing-view'

// Rendered per request, never at build (the build has no DB). Data comes from
// the tag-purged data cache (lib/cache/public-data.ts), so the first request
// after a deploy fills it and later ones don't hit Mongo.
export const dynamic = 'force-dynamic'

export const metadata = pricingMetadata('en')

export default function PricingPage() {
  return <PricingView locale="en" />
}

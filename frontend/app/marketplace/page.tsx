import type { Metadata } from 'next'
import { MarketplaceView, marketplaceMetadata, type SP } from './marketplace-view'

export const dynamic = 'force-dynamic'

/**
 * Hub and per-category pages (?category=x alone) are indexable with their own
 * canonical; search, sort, price, rating, kind, seller and page variants are
 * noindex,follow (SEO-021) so crawl budget goes to items.
 */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  return marketplaceMetadata(searchParams, 'en')
}

export default function MarketplacePage({ searchParams }: { searchParams: SP }) {
  return <MarketplaceView searchParams={searchParams} locale="en" />
}

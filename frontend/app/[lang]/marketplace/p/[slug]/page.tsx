import type { Metadata } from 'next'
import { ProductView, productMetadata } from '@/app/marketplace/p/[slug]/product-view'
import { langOf } from '@/lib/i18n/public-page'

// SEO-047: Hindi / Telugu chrome around the seller's listing (canonical: the English URL).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params
  return productMetadata(p.slug, await langOf(Promise.resolve(p)))
}

export default async function Page({ params }: Props) {
  const p = await params
  return <ProductView slug={p.slug} locale={await langOf(Promise.resolve(p))} />
}

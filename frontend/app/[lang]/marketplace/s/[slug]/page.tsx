import type { Metadata } from 'next'
import { SellerView, sellerMetadata, type SellerSP } from '@/app/marketplace/s/[slug]/seller-view'
import { langOf } from '@/lib/i18n/public-page'

// SEO-047: Hindi / Telugu chrome around a seller's store (canonical: the English URL).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; slug: string }>; searchParams: SellerSP }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const p = await params
  return sellerMetadata(p.slug, searchParams, await langOf(Promise.resolve(p)))
}

export default async function Page({ params, searchParams }: Props) {
  const p = await params
  return <SellerView slug={p.slug} searchParams={searchParams} locale={await langOf(Promise.resolve(p))} />
}

import type { Metadata } from 'next'
import { SellerView, sellerMetadata, type SellerSP } from './seller-view'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: SellerSP }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return sellerMetadata((await params).slug, searchParams, 'en')
}

export default async function SellerPage({ params, searchParams }: Props) {
  return <SellerView slug={(await params).slug} searchParams={searchParams} locale="en" />
}

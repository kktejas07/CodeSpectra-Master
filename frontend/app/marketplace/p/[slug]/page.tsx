import type { Metadata } from 'next'
import { ProductView, productMetadata } from './product-view'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return productMetadata((await params).slug, 'en')
}

export default async function ProductPage({ params }: Props) {
  return <ProductView slug={(await params).slug} locale="en" />
}

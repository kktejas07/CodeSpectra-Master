import type { Metadata } from 'next'
import { DigestListView, digestListMetadata } from '@/app/digest/digest-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

// Same caching as the English page.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: LangParams }): Promise<Metadata> {
  return digestListMetadata(await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  return <DigestListView locale={await langOf(params)} />
}

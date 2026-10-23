/** /digest/<YYYY-MM-DD> — one day's digest (NewsArticle + ItemList JSON-LD). */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DigestDetailView, digestDetailMetadata } from '../digest-view'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ date: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return digestDetailMetadata((await params).date, 'en')
}

export default async function DigestDayPage({ params }: Props) {
  const view = await DigestDetailView({ date: (await params).date, locale: 'en' })
  if (!view) notFound()
  return view
}

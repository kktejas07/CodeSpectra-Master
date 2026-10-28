import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DigestDetailView, digestDetailMetadata } from '@/app/digest/digest-view'
import { langOf } from '@/lib/i18n/public-page'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; date: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params
  return digestDetailMetadata(p.date, await langOf(Promise.resolve(p)))
}

export default async function Page({ params }: Props) {
  const p = await params
  const view = await DigestDetailView({ date: p.date, locale: await langOf(Promise.resolve(p)) })
  if (!view) notFound()
  return view
}

import type { Metadata } from 'next'
import { NewsPostView, newsPostMetadata } from '@/app/news/[slug]/news-post-view'
import { langOf } from '@/lib/i18n/public-page'

// SEO-047: Hindi / Telugu chrome around the English article (canonical: the English URL).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params
  return newsPostMetadata(p.slug, await langOf(Promise.resolve(p)))
}

export default async function Page({ params }: Props) {
  const p = await params
  return <NewsPostView slug={p.slug} locale={await langOf(Promise.resolve(p))} />
}

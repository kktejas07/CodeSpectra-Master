import { ThreadPage, threadMetadata } from '@/app/community/community-view'
import { isPrefixedLocale } from '@/lib/i18n/public-paths'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'
type Params = Promise<{ lang: string; id: string }>

async function parts(params: Params) {
  const { lang, id } = await params
  if (!isPrefixedLocale(lang)) notFound()
  return { lang, id }
}

export async function generateMetadata({ params }: { params: Params }) {
  const { lang, id } = await parts(params)
  return threadMetadata(id, lang)
}

export default async function Page({ params }: { params: Params }) {
  const { lang, id } = await parts(params)
  return <ThreadPage id={id} locale={lang} />
}

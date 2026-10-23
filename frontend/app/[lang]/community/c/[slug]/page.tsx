import { CategoryView, categoryMetadata, type SP } from '@/app/community/community-view'
import { isPrefixedLocale } from '@/lib/i18n/public-paths'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'
type Params = Promise<{ lang: string; slug: string }>

async function parts(params: Params) {
  const { lang, slug } = await params
  if (!isPrefixedLocale(lang)) notFound()
  return { lang, slug }
}

export async function generateMetadata({ params }: { params: Params }) {
  const { lang, slug } = await parts(params)
  return categoryMetadata(slug, lang)
}

export default async function Page({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { lang, slug } = await parts(params)
  return <CategoryView slug={slug} locale={lang} searchParams={searchParams} />
}

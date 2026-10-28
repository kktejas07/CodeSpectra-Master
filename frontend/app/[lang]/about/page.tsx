import { AboutView, aboutMetadata } from '@/app/about/about-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

export async function generateMetadata({ params }: { params: LangParams }) {
  return aboutMetadata(await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  return <AboutView locale={await langOf(params)} />
}

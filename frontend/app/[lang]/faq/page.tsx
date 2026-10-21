import { FaqView, faqMetadata } from '@/app/faq/faq-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

export async function generateMetadata({ params }: { params: LangParams }) {
  return faqMetadata(await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  return <FaqView locale={await langOf(params)} />
}

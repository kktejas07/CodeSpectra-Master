import { FeaturesView, featuresMetadata } from '@/app/features/features-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

export async function generateMetadata({ params }: { params: LangParams }) {
  return featuresMetadata(await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  return <FeaturesView locale={await langOf(params)} />
}

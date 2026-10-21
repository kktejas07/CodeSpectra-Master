import SupportPage from '@/app/support/page'
import { publicPageMetadata, langOf, type LangParams } from '@/lib/i18n/public-page'

// The form / help page is a client component; the [lang] layout's provider gives it this language.
export async function generateMetadata({ params }: { params: LangParams }) {
  return publicPageMetadata('/support', await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  await langOf(params)
  return <SupportPage />
}

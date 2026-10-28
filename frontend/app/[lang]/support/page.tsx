import SupportPage from '@/app/support/page'
import { publicPageMetadata, langOf, type LangParams } from '@/lib/i18n/public-page'
import { PublicPageI18n } from '@/components/i18n/public-page-i18n'

// The form / help page is a client component; the [lang] layout's provider gives it this language.
export async function generateMetadata({ params }: { params: LangParams }) {
  return publicPageMetadata('/support', await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  const locale = await langOf(params)
  return <PublicPageI18n locale={locale} ns={['publicPages']}><SupportPage /></PublicPageI18n>
}

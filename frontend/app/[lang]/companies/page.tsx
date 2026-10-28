import { CompaniesView, companiesMetadata } from '@/app/companies/companies-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'
import { PublicPageI18n } from '@/components/i18n/public-page-i18n'

export async function generateMetadata({ params }: { params: LangParams }) {
  return companiesMetadata(await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  const locale = await langOf(params)
  return <PublicPageI18n locale={locale} ns={['publicPages']}><CompaniesView locale={locale} /></PublicPageI18n>
}

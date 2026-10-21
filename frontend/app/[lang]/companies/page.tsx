import { CompaniesView, companiesMetadata } from '@/app/companies/companies-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

export async function generateMetadata({ params }: { params: LangParams }) {
  return companiesMetadata(await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  return <CompaniesView locale={await langOf(params)} />
}

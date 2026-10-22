import { CertificationsView, certificationsMetadata } from '@/app/certifications/certifications-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: LangParams }) {
  return certificationsMetadata(await langOf(params))
}

export default async function Page({ params }: { params: LangParams }) {
  return <CertificationsView locale={await langOf(params)} />
}

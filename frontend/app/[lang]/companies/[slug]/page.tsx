import type { Metadata } from 'next'
import { getAllSlugs } from '@/lib/companies/company-catalog'
import { CompanyView, companyMetadata } from '@/app/companies/[slug]/company-view'
import { langOf } from '@/lib/i18n/public-page'
import { PublicPageI18n } from '@/components/i18n/public-page-i18n'

type Props = { params: Promise<{ lang: string; slug: string }> }

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params
  return companyMetadata(p.slug, await langOf(Promise.resolve(p)))
}

export default async function Page({ params }: Props) {
  const p = await params
  const locale = await langOf(Promise.resolve(p))
  return <PublicPageI18n locale={locale} ns={['publicPages']}><CompanyView slug={p.slug} locale={locale} /></PublicPageI18n>
}

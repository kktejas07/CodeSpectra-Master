import type { Metadata } from 'next'
import { getAllSlugs } from '@/lib/companies/company-catalog'
import { CompanyView, companyMetadata } from './company-view'

export function generateStaticParams() {
  return getAllSlugs().map(slug => ({ slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return companyMetadata((await params).slug, 'en')
}

export default async function CompanyPage({ params }: Props) {
  return <CompanyView slug={(await params).slug} locale="en" />
}

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { COMPANY_CATALOG, getCompanyBySlug, getAllSlugs } from '@/lib/companies/company-catalog'
import { CompanyDetail } from './company-detail'

export function generateStaticParams() {
  return getAllSlugs().map(slug => ({ slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const company = getCompanyBySlug(slug)
  if (!company) return { title: 'Company Not Found | CodeSpectra' }
  return {
    title: `${company.name} Interview Prep | CodeSpectra`,
    description: `Prepare for ${company.name} interviews with company-specific problems, interview process breakdowns, and expert tips. Difficulty: ${company.difficultyDistribution.hard}% hard questions.`,
    openGraph: {
      title: `${company.name} Interview Prep | CodeSpectra`,
      description: `Company-specific interview prep for ${company.name}. ${company.interviewProcess.length}-step interview process, sample questions, and tips.`,
    },
  }
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params
  const company = getCompanyBySlug(slug)
  if (!company) notFound()
  return <CompanyDetail company={company} />
}

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCompanyBySlug, getAllSlugs } from '@/lib/companies/company-catalog'
import { CompanyDetail } from './company-detail'
import { PublicPageWrapper } from '@/app/public-layout'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, howToJsonLd } from '@/lib/seo/jsonld'
import { getSiteUrl } from '@/lib/seo/site'
import { JsonLd } from '@/components/seo/json-ld'

export function generateStaticParams() {
  return getAllSlugs().map(slug => ({ slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const company = getCompanyBySlug(slug)
  if (!company) return { title: 'Company not found', robots: { index: false } }
  return buildMetadata({
    title: `${company.name} interview prep: process and questions`,
    description: `How ${company.name} interviews: ${company.interviewProcess.length} rounds from ${company.interviewProcess[0]?.step ?? 'screening'} to offer, difficulty mix, sample questions and tips, with practice on CodeSpectra.`,
    path: `/companies/${company.slug}`,
    kind: 'company',
    ogSubtitle: `${company.interviewProcess.length}-step interview process · ${company.difficultyDistribution.hard}% hard questions`,
  })
}

export default async function CompanyPage({ params }: Props) {
  const { slug } = await params
  const company = getCompanyBySlug(slug)
  if (!company) notFound()
  const site = getSiteUrl()
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          howToJsonLd({
            site,
            name: `How to prepare for the ${company.name} interview`,
            description: `The ${company.name} interview process step by step, with a preparation tip for each round.`,
            url: `/companies/${company.slug}`,
            steps: company.interviewProcess.map((s) => ({ name: s.step, text: `${s.description} Tip: ${s.tip}` })),
          }),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Interview prep', path: '/companies' }, { name: company.name, path: `/companies/${company.slug}` }], site),
        ]}
      />
      <CompanyDetail company={company} />
    </PublicPageWrapper>
  )
}

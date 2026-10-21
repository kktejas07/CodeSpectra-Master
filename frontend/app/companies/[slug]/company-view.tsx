/**
 * /companies/<slug> for every language. The prep guide (process, questions,
 * tips) is editorial English; titles, chrome and structured data follow the
 * page language.
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCompanyBySlug } from '@/lib/companies/company-catalog'
import { CompanyDetail } from './company-detail'
import { PublicPageWrapper } from '@/app/public-layout'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, howToJsonLd } from '@/lib/seo/jsonld'
import { getSiteUrl } from '@/lib/seo/site'
import { JsonLd } from '@/components/seo/json-ld'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'

export function companyMetadata(slug: string, locale: Locale): Metadata {
  const company = getCompanyBySlug(slug)
  if (!company) return { title: 'Company not found', robots: { index: false } }
  const t = publicT(locale)
  const rounds = company.interviewProcess.length
  return buildMetadata({
    title: t('hubs.companyMetaTitle', { company: company.name }),
    description: t('hubs.companyMetaDescription', { company: company.name, count: rounds, first: company.interviewProcess[0]?.step ?? t('hubs.companyScreening') }),
    path: `/companies/${company.slug}`,
    kind: 'company',
    ogSubtitle: t('hubs.companyOgSubtitle', { count: rounds, pct: company.difficultyDistribution.hard }),
    locale,
  })
}

export function CompanyView({ slug, locale }: { slug: string; locale: Locale }) {
  const company = getCompanyBySlug(slug)
  if (!company) notFound()
  const site = getSiteUrl()
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const howTo = howToJsonLd({
    site,
    name: t('hubs.companyHowToName', { company: company.name }),
    description: t('hubs.companyHowToDescription', { company: company.name }),
    url: lp(`/companies/${company.slug}`),
    steps: company.interviewProcess.map((s) => ({ name: s.step, text: `${s.description} Tip: ${s.tip}` })),
  })
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          howTo && locale !== 'en' ? { ...howTo, inLanguage: locale } : howTo,
          breadcrumbJsonLd([{ name: t('marketing.crumbHome'), path: lp('/') }, { name: t('public.footInterviewPrep'), path: lp('/companies') }, { name: company.name, path: lp(`/companies/${company.slug}`) }], site),
        ]}
      />
      <CompanyDetail company={company} />
    </PublicPageWrapper>
  )
}

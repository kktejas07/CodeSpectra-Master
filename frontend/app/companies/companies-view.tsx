/** /companies body for every language (English: app/companies/page.tsx, hi / te: app/[lang]/companies). */
import { COMPANY_CATALOG, getIndustries } from '@/lib/companies/company-catalog'
import { CompaniesDirectory } from './companies-directory'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { DeviceShowcase } from '@/components/visuals'
import type { Locale } from '@/lib/i18n/config'
import { publicT } from '@/lib/i18n/public-server'
import { publicPageMetadata } from '@/lib/i18n/public-page'

export const companiesMetadata = (locale: Locale) => publicPageMetadata('/companies', locale, { kind: 'company' })

export function CompaniesView({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  // SEO-060: mock-up copy in the page language (landing.json showcase:*).
  const sc = (en: string) => t.dyn(`landing.showcase:${en}`, en)
  const industries = getIndustries()
  return (
    <PublicPageWrapper>
      <PageHero
        title={t('hubs.companiesTitle')}
        lead={t('hubs.companiesLead')}
        art={<DeviceShowcase tr={sc} variant="candidate" compact />}
      />
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <CompaniesDirectory
          companies={COMPANY_CATALOG}
          industries={industries}
        />
      </div>
    </PublicPageWrapper>
  )
}

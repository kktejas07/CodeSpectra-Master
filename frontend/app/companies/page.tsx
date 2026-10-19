import type { Metadata } from 'next'
import { COMPANY_CATALOG, getIndustries } from '@/lib/companies/company-catalog'
import { CompaniesDirectory } from './companies-directory'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { DeviceShowcase } from '@/components/visuals'
import { buildMetadata } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'

const route = publicRoute('/companies')!
export const metadata: Metadata = buildMetadata({ title: route.title, description: route.description, path: '/companies', kind: 'company' })

export default function CompaniesPage() {
  const industries = getIndustries()
  return (
    <PublicPageWrapper>
      <PageHero
        title="Company interview prep"
        lead="Company-specific problem sets, interview process breakdowns, and tips for top tech companies."
        art={<DeviceShowcase variant="candidate" compact />}
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

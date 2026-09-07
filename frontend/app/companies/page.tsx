import type { Metadata } from 'next'
import { COMPANY_CATALOG, getIndustries } from '@/lib/companies/company-catalog'
import { CompaniesDirectory } from './companies-directory'

export const metadata: Metadata = {
  title: 'Company Interview Prep | CodeSpectra',
  description:
    'Prepare for interviews at Google, Amazon, Meta, Microsoft, Apple, Netflix, Uber, Airbnb, Stripe, and more. Company-specific problem sets, interview process breakdowns, and expert tips.',
  openGraph: {
    title: 'Company Interview Prep | CodeSpectra',
    description:
      'Company-specific interview prep for top tech companies. Practice problems, process breakdowns, and tips.',
  },
}

export default function CompaniesPage() {
  const industries = getIndustries()
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Company Interview Prep
          </h1>
          <p className="mt-3 text-muted-foreground">
            Company-specific problem sets, interview process breakdowns, and tips for top tech companies.
          </p>
        </div>
        <CompaniesDirectory
          companies={COMPANY_CATALOG}
          industries={industries}
        />
      </div>
    </div>
  )
}

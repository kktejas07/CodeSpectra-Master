import { NextResponse } from 'next/server'
import { COMPANY_CATALOG, searchCompanies, getIndustries } from '@/lib/companies/company-catalog'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  const industry = searchParams.get('industry') || undefined

  const companies = searchCompanies(query, industry)
  const industries = getIndustries()

  return NextResponse.json({ companies, industries, total: companies.length })
}

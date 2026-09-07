import { NextResponse } from 'next/server'
import { getCompanyBySlug } from '@/lib/companies/company-catalog'

type Props = { params: Promise<{ slug: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params
  const company = getCompanyBySlug(slug)
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }
  return NextResponse.json(company)
}

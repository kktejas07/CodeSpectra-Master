import type { Metadata } from 'next'
import { CompaniesView, companiesMetadata } from './companies-view'

export const metadata: Metadata = companiesMetadata('en')

export default function CompaniesPage() {
  return <CompaniesView locale="en" />
}

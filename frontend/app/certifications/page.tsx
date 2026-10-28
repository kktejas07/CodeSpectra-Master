import type { Metadata } from 'next'
import { CertificationsView, certificationsMetadata } from './certifications-view'

// Per request from the tag-purged data cache (like /mentors).
export const dynamic = 'force-dynamic'

export function generateMetadata(): Metadata {
  return certificationsMetadata('en')
}

export default function CertificationsPage() {
  return <CertificationsView locale="en" />
}

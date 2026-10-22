import type { Metadata } from 'next'
import { CertificationDetailView, certificationMetadata } from '../certifications-view'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return certificationMetadata((await params).slug, 'en')
}

export default async function CertificationPage({ params }: Props) {
  return <CertificationDetailView slug={(await params).slug} locale="en" />
}

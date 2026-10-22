import type { Metadata } from 'next'
import { CertificationDetailView, certificationMetadata } from '@/app/certifications/certifications-view'
import { langOf } from '@/lib/i18n/public-page'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params
  return certificationMetadata(p.slug, await langOf(Promise.resolve(p)))
}

export default async function Page({ params }: Props) {
  const p = await params
  return <CertificationDetailView slug={p.slug} locale={await langOf(Promise.resolve(p))} />
}

/**
 * Share card for a certificate verification link (LinkedIn/WhatsApp/X
 * preview). Still noindex + no-referrer (from app/cert/layout.tsx); the card
 * shows only the certificate title and issuer — never the holder's name.
 */
import type { Metadata } from 'next'
import { certificationAttempts } from '@/lib/db/certifications'
import { ogImagePath, PRIVATE_PAGE_METADATA } from '@/lib/seo/metadata'

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  let title = 'CodeSpectra certificate'
  let verified = false
  if (TOKEN_RE.test(token)) {
    // A DB outage must not drop the page's <title>/meta (wave 5 crawl): fall back to the generic card.
    const a = await certificationAttempts()
      .then((c) => c.findOne({ verify_token: token, passed: true, revoked_at: null }, { projection: { _id: 0, cert_snapshot: 1 } }))
      .catch(() => null)
    if (a?.cert_snapshot?.title) { title = String(a.cert_snapshot.title).slice(0, 100); verified = true }
  }
  // W4-12: the "Verified certificate" card only for a certificate that verifies.
  const image = verified
    ? ogImagePath({ title, kind: 'certificate', subtitle: 'Issued and verified by CodeSpectra' })
    : ogImagePath({ title: 'Verify a CodeSpectra certificate', kind: 'page' })
  const description = `Verify this ${title} issued by CodeSpectra.`
  return {
    title: { absolute: `Verify certificate: ${title} | CodeSpectra` },
    description,
    ...PRIVATE_PAGE_METADATA,
    openGraph: { type: 'website', siteName: 'CodeSpectra', title: `Verified: ${title}`, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: `Verified: ${title}`, description, images: [image] },
  }
}

export default function CertVerifyLayout({ children }: { children: React.ReactNode }) {
  return children
}

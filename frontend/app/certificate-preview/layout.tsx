import { privateMetadata } from '@/lib/seo/metadata'

// Personal certificate preview.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Certificate preview')

export default function CertificatePreviewLayout({ children }: { children: React.ReactNode }) {
  return children
}

import { privateMetadata } from '@/lib/seo/metadata'

// Personal QR check-in link.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Check-in')

export default function QrLayout({ children }: { children: React.ReactNode }) {
  return children
}

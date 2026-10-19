import { privateMetadata } from '@/lib/seo/metadata'

// Verification of a named participant’s certificate: crawlable for link previews, never indexed.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Certificate verification')

export default function HackathonsVerifyLayout({ children }: { children: React.ReactNode }) {
  return children
}

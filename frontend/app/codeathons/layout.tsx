import { privateMetadata } from '@/lib/seo/metadata'

// Participant results.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Codeathon results')

export default function CodeathonsLayout({ children }: { children: React.ReactNode }) {
  return children
}

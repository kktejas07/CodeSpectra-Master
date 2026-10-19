import { privateMetadata } from '@/lib/seo/metadata'

// Interview join / scheduling links carry a personal token.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Interview')

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return children
}

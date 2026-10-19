import { privateMetadata } from '@/lib/seo/metadata'

// Candidate assessment pages (invite links, live test): personal, never indexed.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Assessment')

export default function AssessmentLayout({ children }: { children: React.ReactNode }) {
  return children
}

import { privateMetadata } from '@/lib/seo/metadata'

// Team invite link with a personal token.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Join team')

export default function HackathonsSlugJoinTokenLayout({ children }: { children: React.ReactNode }) {
  return children
}

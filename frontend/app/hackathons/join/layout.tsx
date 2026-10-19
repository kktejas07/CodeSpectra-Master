import { privateMetadata } from '@/lib/seo/metadata'

// Join-by-code form for invited participants.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Join a hackathon')

export default function HackathonsJoinLayout({ children }: { children: React.ReactNode }) {
  return children
}

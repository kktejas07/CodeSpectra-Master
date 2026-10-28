import { privateMetadata } from '@/lib/seo/metadata'

// Personal hiring invitation link.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Hiring invitation')

export default function HiringInviteLayout({ children }: { children: React.ReactNode }) {
  return children
}

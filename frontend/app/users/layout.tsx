import { privateMetadata } from '@/lib/seo/metadata'

// Member profiles sit behind sign-in until profiles are public.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Profile')

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return children
}

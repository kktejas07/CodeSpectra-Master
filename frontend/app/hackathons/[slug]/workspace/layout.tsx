import { privateMetadata } from '@/lib/seo/metadata'

// Signed-in team workspace.
// noindex,nofollow + no-referrer so the URL never reaches search results or third parties.
export const metadata = privateMetadata('Hackathon workspace')

export default function HackathonsSlugWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children
}

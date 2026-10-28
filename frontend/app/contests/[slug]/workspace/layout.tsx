import { privateMetadata } from '@/lib/seo/metadata'

// Signed-in contest workspace: noindex, never in search results.
export const metadata = privateMetadata('Contest workspace')

export default function ContestWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children
}

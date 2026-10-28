import { buildMetadata } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'

// Metadata for the client page beside this layout (client components can't export metadata).
const route = publicRoute('/status')!
export const metadata = buildMetadata({ title: route.title, description: route.description, path: '/status' })

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}

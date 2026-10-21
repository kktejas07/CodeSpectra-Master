import { buildMetadata } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'

const route = publicRoute('/leagues')!
export const metadata = buildMetadata({ title: route.title, description: route.description, path: '/leagues', kind: 'event' })

export default function LeaguesLayout({ children }: { children: React.ReactNode }) {
  return children
}

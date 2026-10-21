import { buildMetadata } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'

const route = publicRoute('/contests')!
export const metadata = buildMetadata({ title: route.title, description: route.description, path: '/contests', kind: 'hackathon' })

export default function ContestsLayout({ children }: { children: React.ReactNode }) {
  return children
}

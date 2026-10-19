import type { Metadata } from 'next'
import { hackathons } from '@/lib/db/qr-events'
import { buildMetadata } from '@/lib/seo/metadata'

/** Public results page: own title + canonical (not the event page's). Unreleased results are noindex. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const h = await (await hackathons()).findOne({ slug }, { projection: { _id: 0, name: 1, status: 1, results_released: 1 } }).catch(() => null)
  return buildMetadata({
    title: h ? `${h.name}: results and winners` : 'Hackathon results',
    description: h ? `Final standings, scores and winners of ${h.name} on CodeSpectra.` : 'Hackathon results on CodeSpectra.',
    path: `/hackathons/${slug}/results`,
    kind: 'hackathon',
    noIndex: !h || !h.results_released || h.status === 'draft',
  })
}

export default function ResultsLayout({ children }: { children: React.ReactNode }) {
  return children
}

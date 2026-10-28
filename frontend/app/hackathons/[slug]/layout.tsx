/**
 * Server shell for /hackathons/<slug>/**: per-event metadata, Event +
 * Breadcrumb JSON-LD and a real 404 for unknown events (the page itself is a
 * client component that loads live data). Drafts are noindex and get no
 * schema; staff can still open them.
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { hackathons, type HackathonDoc } from '@/lib/db/qr-events'
import { buildMetadata, clampText } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, eventJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { JsonLd } from '@/components/seo/json-ld'

type Params = Promise<{ slug: string }>

const load = cache(async (slug: string): Promise<HackathonDoc | null | 'error'> => {
  try {
    return ((await (await hackathons()).findOne({ slug }, { projection: { _id: 0, name: 1, slug: 1, description: 1, starts_at: 1, ends_at: 1, status: 1, banner_url: 1, event_type: 1, num_teams: 1, max_per_team: 1, updated_at: 1 } })) as HackathonDoc | null)
  } catch {
    return 'error' // DB hiccup: let the client page handle it rather than 404 a real event
  }
})

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const h = await load(slug)
  if (!h || h === 'error') return { title: 'Hackathon', robots: { index: false, follow: true } }
  const kind = h.event_type === 'speed_contest' ? 'Speed contest' : 'Hackathon'
  return buildMetadata({
    title: `${h.name}: ${kind} on CodeSpectra`,
    description: h.description || `${h.name} is a ${kind.toLowerCase()} on CodeSpectra. Teams of up to ${h.max_per_team} join with one link, solve problems and submit their work for judging.`,
    path: `/hackathons/${h.slug}`,
    kind: 'hackathon',
    image: h.banner_url || undefined,
    ogSubtitle: h.starts_at ? new Date(h.starts_at).toUTCString().slice(0, 16) : undefined,
    noIndex: h.status === 'draft',
  })
}

export default async function HackathonLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { slug } = await params
  const h = await load(slug)
  if (h === null) notFound()
  if (h === 'error' || h.status === 'draft') return children
  const site = await getSiteOrigin()
  const path = `/hackathons/${h.slug}`
  return (
    <>
      <JsonLd
        data={[
          eventJsonLd({
            name: h.name,
            description: clampText(h.description || `${h.name} on CodeSpectra`, 500),
            startsAt: h.starts_at,
            endsAt: h.ends_at,
            mode: 'online',
            url: `${site}${path}`,
            pageUrl: path,
            organiser: 'CodeSpectra',
            organiserUrl: site,
            image: h.banner_url || null,
            free: true,
          }, site),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Hackathons', path: '/hackathons' }, { name: h.name, path }], site),
        ]}
      />
      {children}
    </>
  )
}

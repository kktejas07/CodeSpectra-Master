/**
 * /hackathons — public listing, server-rendered so events (and an ItemList
 * pointing at each /hackathons/<slug>) are in the HTML. Drafts never appear.
 */
import { PublicPageWrapper } from '@/app/public-layout'
import { JsonLd } from '@/components/seo/json-ld'
import { hackathons } from '@/lib/db/qr-events'
import { computeHackathonStatus } from '@/lib/services/hackathons'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { HackathonsList, type Hackathon } from './hackathons-client'

export const dynamic = 'force-dynamic'

async function loadPublic(): Promise<Hackathon[] | null> {
  try {
    const rows = await (await hackathons())
      .find({ status: { $ne: 'draft' } }, { projection: { _id: 0, id: 1, name: 1, slug: 1, description: 1, num_teams: 1, max_per_team: 1, timeout_minutes: 1, starts_at: 1, ends_at: 1, status: 1, tasks: 1 } })
      .sort({ created_at: -1 })
      .limit(200)
      .toArray()
    return JSON.parse(JSON.stringify(rows.map((h) => ({ ...h, status: computeHackathonStatus(h.starts_at, h.ends_at, h.status) })))) as Hackathon[]
  } catch (e) {
    console.error('[hackathons] list failed:', (e as Error)?.message)
    return null
  }
}

export default async function PublicHackathonsPage() {
  const [items, site] = await Promise.all([loadPublic(), getSiteOrigin()])
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Hackathons on CodeSpectra',
            url: `${site}/hackathons`,
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: items?.length ?? 0,
              itemListElement: (items ?? []).slice(0, 100).map((h, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site}/hackathons/${encodeURIComponent(h.slug)}`, name: h.name })),
            },
          },
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Hackathons', path: '/hackathons' }], site),
        ]}
      />
      <HackathonsList initial={items} />
    </PublicPageWrapper>
  )
}

/**
 * /contests — hosted contests (all formats), server-rendered so the list and
 * an ItemList are in the HTML. Drafts and unlisted contests never appear.
 */
import { PublicPageWrapper } from '@/app/public-layout'
import { JsonLd } from '@/components/seo/json-ld'
import { ContestsList, type ContestCard } from '@/components/contests/contests-list'
import { contestPhase } from '@/lib/contests/config'
import { publicContestsCached } from '@/lib/cache/public-data'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { logger } from '@/lib/logger'

// Rendered per request, never at build (the build has no DB). Data comes from
// the tag-purged data cache (lib/cache/public-data.ts), so the first request
// after a deploy fills it and later ones don't hit Mongo.
export const dynamic = 'force-dynamic'

async function load(): Promise<ContestCard[] | null> {
  try {
    const rows = await publicContestsCached()
    return rows.map((c) => ({
      id: c.id, slug: c.slug, title: c.title, summary: c.summary, format: c.format, phase: contestPhase(c),
      starts_at: c.schedule.starts_at, ends_at: c.schedule.ends_at, timezone: c.schedule.timezone,
      mode: c.participation.mode, team_max: c.participation.team_max, prize_text: c.prize_text,
    }))
  } catch (e) {
    logger.error('[contests] public list failed', (e as Error).message)
    return null
  }
}

export default async function ContestsPage() {
  const [items, site] = await Promise.all([load(), getSiteOrigin()])
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Contests on CodeSpectra',
            url: `${site}/contests`,
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: items?.length ?? 0,
              itemListElement: (items ?? []).slice(0, 100).map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site}/contests/${encodeURIComponent(c.slug)}`, name: c.title })),
            },
          },
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Contests', path: '/contests' }], site),
        ]}
      />
      <ContestsList items={items} />
    </PublicPageWrapper>
  )
}

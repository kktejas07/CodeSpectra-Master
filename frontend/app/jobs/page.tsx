/**
 * /jobs — server-rendered job board: active posts are in the HTML (and in
 * /sitemaps/jobs.xml), with an ItemList pointing at each /jobs/<id> page.
 * Filtering stays client-side in JobsBoard. Filtered URLs are noindex,follow.
 */
import type { Metadata } from 'next'
import { PublicPageWrapper } from '@/app/public-layout'
import { JsonLd } from '@/components/seo/json-ld'
import { getMongoDb } from '@/lib/mongodb'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { publicRoute } from '@/lib/seo/public-routes'
import { getSiteOrigin } from '@/lib/seo/settings'
import { JobsBoard, type JobPosting, type JobsQuery } from './jobs-board-client'

export const dynamic = 'force-dynamic'

type SP = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 100) || ''

const route = publicRoute('/jobs')!

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams
  const filtered = !!(one(sp.q) || one(sp.type) || one(sp.level) || one(sp.loc))
  return buildMetadata({ title: route.title, description: route.description, path: '/jobs', kind: 'job', noIndex: filtered ? 'follow' : false })
}

async function loadJobs(): Promise<JobPosting[] | null> {
  try {
    const rows = await (await getMongoDb()).collection('job_postings')
      .find({ is_active: true }, { projection: { _id: 0, created_by: 0, tenant_id: 0 } })
      .sort({ created_at: -1 })
      .limit(500)
      .toArray()
    return JSON.parse(JSON.stringify(rows)) as JobPosting[]
  } catch (e) {
    console.error('[jobs] list failed:', (e as Error)?.message)
    return null
  }
}

export default async function JobsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const query: JobsQuery = { q: one(sp.q), type: one(sp.type), level: one(sp.level), loc: one(sp.loc) }
  const [jobs, site] = await Promise.all([loadJobs(), getSiteOrigin()])
  const list = jobs ?? []
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: route.title,
            description: route.description,
            url: `${site}/jobs`,
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: list.length,
              itemListElement: list.slice(0, 100).map((j, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site}/jobs/${encodeURIComponent(j.id)}`, name: j.title })),
            },
          },
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Jobs', path: '/jobs' }], site),
        ]}
      />
      <JobsBoard initialJobs={jobs} initialQuery={query} />
    </PublicPageWrapper>
  )
}

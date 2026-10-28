/**
 * /hackathons/<slug>: SEO-003 — the published event (description, schedule,
 * tasks, rules) is rendered on the server so crawlers and no-JS previews see
 * it; teams and sign-in actions load in the client component. The layout
 * already 404s unknown slugs and emits the Event JSON-LD.
 */
import { cache } from 'react'
import { hackathons, type HackathonDoc } from '@/lib/db/qr-events'
import { computeHackathonStatus } from '@/lib/services/hackathons'
import { HackathonDetail, type Hackathon } from './hackathon-client'

const loadPublic = cache(async (slug: string): Promise<Hackathon | null> => {
  try {
    const doc = (await (await hackathons()).findOne({ slug }, { projection: { _id: 0, judges: 0, created_by: 0 } })) as HackathonDoc | null
    if (!doc || doc.status === 'draft') return null
    // Same anonymous view as GET /api/hackathons/[id] (no judge or creator ids); status as the API would show it.
    const auto = computeHackathonStatus(doc.starts_at, doc.ends_at, doc.status)
    const status = auto !== doc.status && (auto === 'closed' || (auto === 'live' && doc.status === 'open')) ? auto : doc.status
    return JSON.parse(JSON.stringify({ ...doc, status, is_judge: false, is_staff: false })) as Hackathon
  } catch {
    return null // DB hiccup: the client component loads it
  }
})

export default async function HackathonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <HackathonDetail slug={slug} initial={await loadPublic(slug)} />
}

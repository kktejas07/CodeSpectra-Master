/**
 * /hackathons/<slug>/results: SEO-003 — released standings are rendered on the
 * server (signed-out view, lib/hackathons/public-results.ts); a signed-in
 * viewer's own team and certificate load in the client component.
 */
import { notFound } from 'next/navigation'
import { loadPublicResults } from '@/lib/hackathons/public-results'
import { HackathonResults, type ResultsInitial } from './results-client'

export default async function HackathonResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let out: Awaited<ReturnType<typeof loadPublicResults>> | undefined
  try { out = await loadPublicResults(slug, null) } catch { out = undefined } // DB hiccup: the client component loads it
  if (out === null) notFound()
  const initial = out ? (JSON.parse(JSON.stringify(out)) as ResultsInitial) : null
  return <HackathonResults slug={slug} initial={initial} />
}

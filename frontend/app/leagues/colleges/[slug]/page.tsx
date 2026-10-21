/**
 * /leagues/colleges/[slug] — one college on the university league (public,
 * cached; only colleges that opted in). Students are shown as "Priya S.".
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { JsonLd } from '@/components/seo/json-ld'
import { LeagueBoard } from '@/components/leagues/board'
import { collegeLeagueCached } from '@/lib/leagues/public'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const valid = (s: string) => /^[a-z0-9-]{2,80}$/.test(s)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const d = valid(slug) ? await collegeLeagueCached(slug).catch(() => null) : null
  if (!d) return buildMetadata({ title: 'College league', description: 'University league standings on CodeSpectra.', path: `/leagues/colleges/${slug}`, noIndex: true })
  return buildMetadata({ title: `${d.college.name} on the university league`, description: `${d.college.name}'s standing, top students and teams in the CodeSpectra university league.`, path: `/leagues/colleges/${slug}`, kind: 'event' })
}

export default async function CollegeLeaguePage({ params }: Props) {
  const { slug } = await params
  if (!valid(slug)) notFound()
  const [d, site] = await Promise.all([collegeLeagueCached(slug), getSiteOrigin()])
  if (!d) notFound()
  return (
    <PublicPageWrapper>
      <JsonLd data={[
        { '@context': 'https://schema.org', '@type': 'CollegeOrUniversity', name: d.college.name, ...(d.college.city ? { address: { '@type': 'PostalAddress', addressLocality: d.college.city, ...(d.college.state ? { addressRegion: d.college.state } : {}) } } : {}) },
        breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Leagues', path: '/leagues' }, { name: d.college.name, path: `/leagues/colleges/${slug}` }], site),
      ]} />
      <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-12 sm:px-6 lg:px-8">
        <Link href="/leagues" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" aria-hidden />All leagues</Link>
        <header>
          <h1 className="cs-display text-4xl sm:text-5xl">{d.college.name}</h1>
          <p className="mt-2 text-muted-foreground">{[d.college.city, d.college.state].filter(Boolean).join(', ')}</p>
        </header>
        {!d.season ? (
          <p className="text-muted-foreground">No league season is running yet.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-border/70 bg-card p-5"><p className="text-sm text-muted-foreground">{d.season.name}</p><p className="text-3xl font-bold tabular-nums text-foreground">{d.standing ? `#${d.standing.rank}` : '—'}</p><p className="text-xs text-muted-foreground">{d.standing ? `of ${d.standing.of} colleges` : 'No points yet this season'}</p></div>
              <div className="rounded-3xl border border-border/70 bg-card p-5"><p className="text-sm text-muted-foreground">Points</p><p className="text-3xl font-bold tabular-nums text-foreground">{d.standing ? d.standing.points.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : 0}</p></div>
              <div className="rounded-3xl border border-border/70 bg-card p-5"><p className="text-sm text-muted-foreground">Scoring students</p><p className="text-3xl font-bold tabular-nums text-foreground">{d.standing?.scoring_students ?? 0}</p></div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <LeagueBoard title="Top students" caption="Overall rank in the individual table." rows={d.members.map((m) => ({ rank: m.rank, name: m.name, points: m.points, sub: `${m.events} events` }))} empty="No student from this college has points yet." />
              <LeagueBoard title="Teams" rows={d.teams.map((t) => ({ rank: t.rank, name: t.name, points: t.points, sub: `${t.members} members` }))} empty="No all-college team has points yet." />
            </div>
          </>
        )}
      </div>
    </PublicPageWrapper>
  )
}

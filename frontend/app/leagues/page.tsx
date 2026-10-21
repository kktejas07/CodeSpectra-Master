/**
 * /leagues — public university and team league tables for the current (or
 * chosen) season. Server-rendered from the tag-purged data cache
 * (lib/leagues/public.ts); no user ids or emails, names masked ("Priya S.").
 */
import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { JsonLd } from '@/components/seo/json-ld'
import { PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { LeagueBoard } from '@/components/leagues/board'
import { leaguesOverviewCached } from '@/lib/leagues/public'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ season?: string }> }

const PHASE: Record<string, string> = { live: 'Live', upcoming: 'Starts soon', ended: 'Ended — final table coming', final: 'Final', draft: 'Draft' }

async function load(season: string | null) {
  try {
    return await leaguesOverviewCached(season)
  } catch (e) {
    logger.error('[leagues] public page failed', (e as Error).message)
    return null
  }
}

export default async function LeaguesPage({ searchParams }: Props) {
  const sp = await searchParams
  const slug = typeof sp.season === 'string' && /^[a-z0-9-]{3,60}$/.test(sp.season) ? sp.season : null
  const [data, site] = await Promise.all([load(slug), getSiteOrigin()])
  const b = data?.boards ?? null
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'University and team leagues on CodeSpectra', url: `${site}/leagues` },
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Leagues', path: '/leagues' }], site),
        ]}
      />
      <PageHero
        title="University and team leagues"
        lead="Every quarter, results from contests, codeathons, hackathons and the arena add up for you, your team and your college. Placement points, a bonus for showing up, more for harder events."
        actions={
          <>
            <Link href="/dashboard/leagues" className={btnPrimary}>Join or create a team</Link>
            <Link href="/contests" className={btnSecondary}>Find a contest</Link>
          </>
        }
      />
      <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-12 sm:px-6 lg:px-8">
        {data === null ? (
          <EmptyState className="mx-auto max-w-xl" illustration="error" title="We couldn't load the league tables" description="Refresh the page in a moment." />
        ) : !b ? (
          <EmptyState className="mx-auto max-w-xl" illustration="leaderboard" title="The first season hasn't started yet" description="Create a free account and take part in contests — your results will count when the season opens." actionLabel="Create a free account" actionHref="/auth/signup" />
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-primary">{PHASE[b.season.phase] ?? b.season.phase}</p>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{b.season.name}</h2>
                <p className="text-sm text-muted-foreground">{fmt(b.season.starts_at)} – {fmt(b.season.ends_at)} · {b.events} events counted</p>
              </div>
              {data.seasons.length > 1 && (
                <nav aria-label="Seasons" className="flex flex-wrap gap-2">
                  {data.seasons.slice(0, 8).map((s) => (
                    <Link key={s.id} href={`/leagues?season=${encodeURIComponent(s.slug)}`} aria-current={s.id === b.season.id ? 'page' : undefined}
                      className={cn('inline-flex min-h-10 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', s.id === b.season.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40')}>
                      {s.name}
                    </Link>
                  ))}
                </nav>
              )}
            </div>
            <div className="cs-stagger grid gap-5 lg:grid-cols-3">
              <LeagueBoard
                title="Colleges" caption="Sum of each college's best students."
                rows={b.colleges.slice(0, 25).map((c) => ({ rank: c.rank, name: c.name, points: c.points, href: c.slug ? `/leagues/colleges/${encodeURIComponent(c.slug)}` : null, sub: `${c.scoring_students} scoring students` }))}
                empty="No college has points yet. Colleges appear once their verified students score."
              />
              <LeagueBoard
                title="Teams" caption="Best member result per event."
                rows={b.teams.slice(0, 25).map((t) => ({ rank: t.rank, name: t.name, points: t.points, sub: [t.college, `${t.members} members`].filter(Boolean).join(' · ') }))}
                empty="No team has points yet."
              />
              <LeagueBoard
                title="Individuals"
                rows={b.individuals.slice(0, 25).map((r) => ({ rank: r.rank, name: r.name, points: r.points, sub: r.college }))}
                empty="No points yet this season."
              />
            </div>
            <p className="text-xs text-muted-foreground">Updated {new Date(b.computed_at).toLocaleString('en-IN', { timeZone: 'UTC' })} UTC. Only public events with released results count.</p>
          </>
        )}
      </div>
    </PublicPageWrapper>
  )
}

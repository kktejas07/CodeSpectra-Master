/**
 * /leagues body for every language — public university and team league tables for the current (or
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
import type { Locale } from '@/lib/i18n/config'
import { formatDate } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'
import { publicPageMetadata } from '@/lib/i18n/public-page'

export type LeaguesSP = Promise<{ season?: string }>

const PHASE: Record<string, string> = { live: 'Live', upcoming: 'Starts soon', ended: 'Ended — final table coming', final: 'Final', draft: 'Draft' }

export const leaguesMetadata = (locale: Locale) => publicPageMetadata('/leagues', locale, { kind: 'event' })

async function load(season: string | null) {
  try {
    return await leaguesOverviewCached(season)
  } catch (e) {
    logger.error('[leagues] public page failed', (e as Error).message)
    return null
  }
}

export async function LeaguesView({ searchParams, locale }: { searchParams: LeaguesSP; locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const sp = await searchParams
  const slug = typeof sp.season === 'string' && /^[a-z0-9-]{3,60}$/.test(sp.season) ? sp.season : null
  const [data, site] = await Promise.all([load(slug), getSiteOrigin()])
  const b = data?.boards ?? null
  const fmt = (iso: string) => formatDate(locale, iso, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return (
    <PublicPageWrapper>
      <JsonLd
        data={[
          { '@context': 'https://schema.org', '@type': 'CollectionPage', name: t('hubs.leaguesListName'), url: `${site}${lp('/leagues')}`, ...(locale !== 'en' ? { inLanguage: locale } : {}) },
          breadcrumbJsonLd([{ name: t('marketing.crumbHome'), path: lp('/') }, { name: t('hubs.leaguesCrumb'), path: lp('/leagues') }], site),
        ]}
      />
      <PageHero
        title={t('hubs.leaguesTitle')}
        lead={t('hubs.leaguesLead')}
        actions={
          <>
            <Link href="/dashboard/leagues" className={btnPrimary}>{t('hubs.leaguesJoin')}</Link>
            <Link href={lp('/contests')} className={btnSecondary}>{t('hubs.leaguesFind')}</Link>
          </>
        }
      />
      <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-12 sm:px-6 lg:px-8">
        {data === null ? (
          <EmptyState className="mx-auto max-w-xl" illustration="error" title={t('hubs.leaguesLoadFailed')} description={t('publicPages.refreshSoon')} />
        ) : !b ? (
          <EmptyState className="mx-auto max-w-xl" illustration="leaderboard" title={t('hubs.leaguesNoSeason')} description={t('hubs.leaguesNoSeasonBody')} actionLabel={t('public.createFreeAccount')} actionHref="/auth/signup" />
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-primary">{t.dyn(`hubs.leaguePhase:${b.season.phase}`, PHASE[b.season.phase] ?? b.season.phase)}</p>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{b.season.name}</h2>
                <p className="text-sm text-muted-foreground">{fmt(b.season.starts_at)} – {fmt(b.season.ends_at)} · {t('hubs.leaguesEvents', { count: b.events })}</p>
              </div>
              {data.seasons.length > 1 && (
                <nav aria-label={t('hubs.leaguesSeasons')} className="flex flex-wrap gap-2">
                  {data.seasons.slice(0, 8).map((s) => (
                    <Link key={s.id} href={`${lp('/leagues')}?season=${encodeURIComponent(s.slug)}`} aria-current={s.id === b.season.id ? 'page' : undefined}
                      className={cn('inline-flex min-h-10 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', s.id === b.season.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40')}>
                      {s.name}
                    </Link>
                  ))}
                </nav>
              )}
            </div>
            <div className="cs-stagger grid gap-5 lg:grid-cols-3">
              <LeagueBoard
                title={t('hubs.leaguesColleges')} caption={t('hubs.leaguesCollegesCaption')}
                rows={b.colleges.slice(0, 25).map((c) => ({ rank: c.rank, name: c.name, points: c.points, href: c.slug ? `/leagues/colleges/${encodeURIComponent(c.slug)}` : null, sub: t('hubs.leaguesScoringStudents', { count: c.scoring_students }) }))}
                empty={t('hubs.leaguesCollegesEmpty')}
              />
              <LeagueBoard
                title={t('hubs.leaguesTeams')} caption={t('hubs.leaguesTeamsCaption')}
                rows={b.teams.slice(0, 25).map((x) => ({ rank: x.rank, name: x.name, points: x.points, sub: [x.college, t('hubs.leaguesMembers', { count: x.members })].filter(Boolean).join(' · ') }))}
                empty={t('hubs.leaguesTeamsEmpty')}
              />
              <LeagueBoard
                title={t('hubs.leaguesIndividuals')}
                rows={b.individuals.slice(0, 25).map((r) => ({ rank: r.rank, name: r.name, points: r.points, sub: r.college }))}
                empty={t('hubs.leaguesIndividualsEmpty')}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('hubs.leaguesUpdated', { when: new Date(b.computed_at).toLocaleString(locale === 'en' ? 'en-IN' : `${locale}-IN`, { timeZone: 'UTC' }) })}</p>
          </>
        )}
      </div>
    </PublicPageWrapper>
  )
}

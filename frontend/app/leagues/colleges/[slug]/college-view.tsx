/**
 * /leagues/colleges/[slug] — one college on the university league (public,
 * cached; only colleges that opted in). Students are shown as "Priya S.".
 * Every language (English: ./page.tsx, hi / te: app/[lang]/leagues/colleges/[slug], SEO-047).
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
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT } from '@/lib/i18n/public-server'

const valid = (s: string) => /^[a-z0-9-]{2,80}$/.test(s)

export async function collegeLeagueMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const t = publicT(locale)
  const d = valid(slug) ? await collegeLeagueCached(slug).catch(() => null) : null
  if (!d) return buildMetadata({ title: t('hubs.dtCollegeFallbackTitle'), description: t('hubs.dtCollegeFallbackDesc'), path: `/leagues/colleges/${slug}`, locale, noIndex: true })
  return buildMetadata({ title: t('hubs.dtCollegeTitle', { college: d.college.name }), description: t('hubs.dtCollegeDesc', { college: d.college.name }), path: `/leagues/colleges/${slug}`, locale, kind: 'event' })
}

export async function CollegeLeagueView({ slug, locale }: { slug: string; locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  if (!valid(slug)) notFound()
  const [d, site] = await Promise.all([collegeLeagueCached(slug), getSiteOrigin()])
  if (!d) notFound()
  return (
    <PublicPageWrapper>
      <JsonLd data={[
        { '@context': 'https://schema.org', '@type': 'CollegeOrUniversity', name: d.college.name, ...(d.college.city ? { address: { '@type': 'PostalAddress', addressLocality: d.college.city, ...(d.college.state ? { addressRegion: d.college.state } : {}) } } : {}) },
        breadcrumbJsonLd([{ name: t('marketing.crumbHome'), path: lp('/') }, { name: t('hubs.leaguesCrumb'), path: lp('/leagues') }, { name: d.college.name, path: lp(`/leagues/colleges/${slug}`) }], site),
      ]} />
      <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-12 sm:px-6 lg:px-8">
        <Link href={lp('/leagues')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" aria-hidden />{t('hubs.dtAllLeagues')}</Link>
        <header>
          <h1 className="cs-display text-4xl sm:text-5xl">{d.college.name}</h1>
          <p className="mt-2 text-muted-foreground">{[d.college.city, d.college.state].filter(Boolean).join(', ')}</p>
        </header>
        {!d.season ? (
          <p className="text-muted-foreground">{t('hubs.dtNoSeason')}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-border/70 bg-card p-5"><p className="text-sm text-muted-foreground">{d.season.name}</p><p className="text-3xl font-bold tabular-nums text-foreground">{d.standing ? `#${d.standing.rank}` : '—'}</p><p className="text-xs text-muted-foreground">{d.standing ? t('hubs.dtRankOf', { count: d.standing.of }) : t('hubs.dtNoPointsYet')}</p></div>
              <div className="rounded-3xl border border-border/70 bg-card p-5"><p className="text-sm text-muted-foreground">{t('hubs.dtPoints')}</p><p className="text-3xl font-bold tabular-nums text-foreground">{d.standing ? d.standing.points.toLocaleString(locale === 'en' ? 'en-IN' : `${locale}-IN`, { maximumFractionDigits: 1 }) : 0}</p></div>
              <div className="rounded-3xl border border-border/70 bg-card p-5"><p className="text-sm text-muted-foreground">{t('hubs.dtScoringStudents')}</p><p className="text-3xl font-bold tabular-nums text-foreground">{d.standing?.scoring_students ?? 0}</p></div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <LeagueBoard locale={locale} title={t('hubs.dtTopStudents')} caption={t('hubs.dtTopStudentsCaption')} rows={d.members.map((m) => ({ rank: m.rank, name: m.name, points: m.points, sub: t('hubs.dtEvents', { count: m.events }) }))} empty={t('hubs.dtNoStudentPoints')} />
              <LeagueBoard locale={locale} title={t('hubs.leaguesTeams')} rows={d.teams.map((x) => ({ rank: x.rank, name: x.name, points: x.points, sub: t('hubs.leaguesMembers', { count: x.members }) }))} empty={t('hubs.dtNoTeamPoints')} />
            </div>
          </>
        )}
      </div>
    </PublicPageWrapper>
  )
}

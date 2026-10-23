/**
 * /learn — public Learn hub: search, filters (category, level, tag, series),
 * pagination. Server-rendered from published posts only. Also holds the
 * team's posts (blog_posts, "From the team", ?source=team&category=<blog
 * category>); news stays at /news. See lib/learn/team-posts.ts.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, Rss } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { EmptyState } from '@/components/ui/empty-state'
import { HubCardView, type CardLabels } from '@/components/learn/post-card'
import { LearnCategoryIcon } from '@/components/learn/category-icon'
import { NotifyBox } from '@/components/events-feed/notify-box'
import { AskBox } from '@/components/public-ask/ask-box'
import { parseListParams } from '@/lib/learn/queries'
import type { listHub } from '@/lib/learn/team-queries'
import { learnHubCached, learnSeriesCached } from '@/lib/cache/public-data'
import { TEAM_CATEGORIES, TEAM_LABEL, TEAM_SOURCE, isTeamCategory, teamCategoryLabel } from '@/lib/learn/team-posts'
import { LEARN_CATEGORIES, LEARN_LEVELS, categoryLabel } from '@/lib/learn/types'
import { cn } from '@/lib/utils'
import { buildMetadata } from '@/lib/seo/metadata'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT, type PublicTranslator } from '@/lib/i18n/public-server'

// Learn hub for every language (English: app/learn/page.tsx, hi / te:
// app/[lang]/learn). Posts are shown in the language they were written in;
// the hub chrome (search, filters, paging) follows the page language.

export type SP = Promise<Record<string, string | string[] | undefined>>

const catName = (t: PublicTranslator, id: string, fallback: string) => t.dyn(`learn.category:${id}`, fallback)
const teamCatName = (t: PublicTranslator, id: string) => t.dyn(`hubs.teamCat:${id}`, teamCategoryLabel(id))

/** Post-card chrome in the hub language (undefined → the card's English defaults). */
function cardLabels(t: PublicTranslator): CardLabels | undefined {
  if (t.locale === 'en') return undefined
  return {
    category: (id, fallback) => catName(t, id, fallback),
    teamCategory: (id) => teamCatName(t, id),
    level: (l) => t.dyn(`hubs.level:${l}`, l),
    minRead: (n) => t('learn.minRead', { count: n }),
    series: (s) => t('learn.seriesLabel', { series: s }),
    team: t('hubs.teamLabel'),
  }
}

/**
 * Hub + one indexable page per category (?category=x, self-canonical). Search,
 * tag, level, series and page variants are noindex,follow so crawlers follow
 * the posts without indexing endless filter combinations.
 */
export async function learnMetadata(searchParams: SP, locale: Locale): Promise<Metadata> {
  const t = publicT(locale)
  const p = parseListParams(await searchParams)
  const team = p.source === TEAM_SOURCE
  const cat = !team && p.category && LEARN_CATEGORIES.some((c) => c.id === p.category) ? p.category : null
  const teamCat = team && isTeamCategory(p.category) ? p.category : null
  const other = !!(p.q || p.tag || p.level || p.series || (p.page && p.page > 1))
  const base = team
    ? buildMetadata({
        title: teamCat ? `${t('hubs.teamLabel')}: ${teamCatName(t, teamCat)}` : t('hubs.teamMetaTitle'),
        description: t('hubs.teamMetaDescription'),
        path: '/learn',
        locale,
        canonical: teamCat ? `/learn?source=${TEAM_SOURCE}&category=${encodeURIComponent(teamCat)}` : `/learn?source=${TEAM_SOURCE}`,
        noIndex: other ? 'follow' : false,
      })
    : cat
    ? buildMetadata({
        title: t('hubs.learnCatMetaTitle', { category: catName(t, cat, categoryLabel(cat)) }),
        description: t('hubs.learnCatMetaDescription', { category: locale === 'en' ? categoryLabel(cat).toLowerCase() : catName(t, cat, categoryLabel(cat)) }),
        path: '/learn',
        locale,
        canonical: `/learn?category=${encodeURIComponent(cat)}`,
        noIndex: other ? 'follow' : false,
      })
    : buildMetadata({
        title: t('hubs.learnMetaTitle'),
        description: t('hubs.learnMetaDescription'),
        path: '/learn',
        locale,
        noIndex: other ? 'follow' : false,
      })
  return { ...base, alternates: { ...base.alternates, types: { 'application/rss+xml': '/learn/rss.xml' } } }
}

function hrefWith(root: string, base: Record<string, string | null | undefined>, patch: Record<string, string | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) sp.set(k, v)
  sp.delete('page')
  if (patch.page) sp.set('page', patch.page)
  const s = sp.toString()
  return s ? `${root}?${s}` : root
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/40 hover:text-primary',
      )}
    >
      {children}
    </Link>
  )
}

export async function LearnView({ searchParams, locale }: { searchParams: SP; locale: Locale }) {
  const t = publicT(locale)
  const root = localizedPath('/learn', locale)
  const raw = await searchParams
  const params = parseListParams(raw)
  let data: Awaited<ReturnType<typeof listHub>> = { items: [], total: 0, page: 1, pages: 1 }
  let series: string[] = []
  try {
    ;[data, series] = await Promise.all([learnHubCached(params), learnSeriesCached()])
  } catch (e) {
    console.error('[learn] page:', (e as Error)?.message)
  }
  const team = params.source === TEAM_SOURCE
  const cur = { q: params.q, category: params.category, level: params.level, tag: params.tag, series: params.series, source: team ? TEAM_SOURCE : null }
  const filtered = !!(params.q || params.category || params.level || params.tag || params.series || team)
  const catLabel = params.category ? (team ? teamCatName(t, params.category) : catName(t, params.category, categoryLabel(params.category))) : ''
  const hw = (patch: Record<string, string | null>) => hrefWith(root, cur, patch)
  const countLine = [
    t('hubs.learnCount', { count: data.total }),
    team ? t('hubs.learnFromTeam') : '',
    catLabel ? t('hubs.learnInCategory', { category: catLabel }) : '',
    params.tag ? t('hubs.learnTagged', { tag: params.tag }) : '',
    params.series ? t('hubs.learnInSeries', { series: params.series }) : '',
  ].filter(Boolean).join(' ')

  return (
    <PublicPageWrapper>
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold text-primary">{t('hubs.learnEyebrow')}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{t('hubs.learnTitle')}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t('hubs.learnLead')}</p>
        </header>

        <form action={root} method="get" role="search" className="mt-8 flex max-w-xl gap-2">
          {team ? <input type="hidden" name="source" value={TEAM_SOURCE} /> : null}
          {params.category ? <input type="hidden" name="category" value={params.category} /> : null}
          {params.level ? <input type="hidden" name="level" value={params.level} /> : null}
          <label htmlFor="learn-q" className="sr-only">{t('hubs.learnSearch')}</label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="learn-q"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder={t('hubs.learnSearchPlaceholder')}
              maxLength={80}
              className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button type="submit" className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t('common.search')}
          </button>
        </form>

        <nav aria-label={t('hubs.learnFilterCategory')} className="mt-6 flex flex-wrap gap-2">
          <Chip href={hw({ category: null, source: null })} active={!params.category && !team}>{t('hubs.learnAllTopics')}</Chip>
          {LEARN_CATEGORIES.map((c) => (
            <Chip key={c.id} href={hw({ category: c.id, source: null })} active={!team && params.category === c.id}><LearnCategoryIcon id={c.id} className="mr-1.5 h-3.5 w-3.5" />{catName(t, c.id, c.label)}</Chip>
          ))}
          <Chip href={hw({ category: null, level: null, series: null, source: TEAM_SOURCE })} active={team}>{locale === 'en' ? TEAM_LABEL : t('hubs.teamLabel')}</Chip>
        </nav>
        {team ? (
          <nav aria-label={t('hubs.learnFilterTeam')} className="mt-3 flex flex-wrap items-center gap-2">
            <Chip href={hw({ category: null })} active={!params.category}>{t('hubs.learnAllTeam')}</Chip>
            {TEAM_CATEGORIES.map((c) => (
              <Chip key={c.id} href={hw({ category: c.id })} active={params.category === c.id}>{teamCatName(t, c.id)}</Chip>
            ))}
          </nav>
        ) : null}
        {!team ? <>
        <nav aria-label={t('hubs.learnFilterLevel')} className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted-foreground">{t('hubs.learnLevel')}</span>
          <Chip href={hw({ level: null })} active={!params.level}>{t('hubs.any')}</Chip>
          {LEARN_LEVELS.map((l) => (
            <Chip key={l} href={hw({ level: l })} active={params.level === l}><span className="capitalize">{t.dyn(`hubs.level:${l}`, l)}</span></Chip>
          ))}
        </nav>
        {series.length > 0 && (
          <nav aria-label={t('hubs.learnSeries')} className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-muted-foreground">{t('hubs.learnSeries')}</span>
            {series.map((s) => (
              <Chip key={s} href={hw({ series: params.series === s ? null : s })} active={params.series === s}>{s}</Chip>
            ))}
          </nav>
        )}
        </> : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">{countLine}</p>
          <div className="flex items-center gap-4 text-sm">
            {filtered ? <Link href={root} className="font-medium text-primary hover:underline">{t('hubs.clearFilters')}</Link> : null}
            <a href="/learn/rss.xml" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Rss className="h-4 w-4" aria-hidden /> RSS</a>
          </div>
        </div>

        {data.items.length === 0 ? (
          <EmptyState
            className="mt-6"
            variant="search"
            title={filtered ? t('hubs.learnEmptyFiltered') : t('hubs.learnEmpty')}
            description={filtered ? t('hubs.learnEmptyFilteredBody') : t('hubs.learnEmptyBody')}
            actionLabel={filtered ? t('hubs.clearFilters') : t('hubs.learnPractise')}
            actionHref={filtered ? root : '/dashboard/problems'}
          />
        ) : (
          <div className="cs-stagger mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {data.items.map((p) => <HubCardView key={`${p.kind}:${p.slug}`} post={p} labels={cardLabels(t)} />)}
          </div>
        )}

        {data.pages > 1 && (
          <nav aria-label={t('hubs.pages')} className="mt-10 flex items-center justify-center gap-3 text-sm">
            {data.page > 1 ? <Link className="rounded-lg border border-border px-4 py-2 hover:border-primary/40" href={hw({ page: String(data.page - 1) })}>{t('common.previous')}</Link> : null}
            <span className="tabular-nums text-muted-foreground">{t('hubs.pageOf', { page: data.page, pages: data.pages })}</span>
            {data.page < data.pages ? <Link className="rounded-lg border border-border px-4 py-2 hover:border-primary/40" href={hw({ page: String(data.page + 1) })}>{t('common.next')}</Link> : null}
          </nav>
        )}

        <AskBox className="mx-auto mt-14 max-w-3xl" locale={locale === 'hi' || locale === 'te' ? locale : 'en'} />

        <section aria-label={t('hubs.learnSubscribe')} className="mx-auto mt-14 max-w-xl">
          <NotifyBox topic="blog" />
        </section>
      </div>
    </PublicPageWrapper>
  )
}

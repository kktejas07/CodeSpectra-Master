import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, Search, Star } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { HeroIllustration, PageHero } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { buildMetadata } from '@/lib/seo/metadata'
import { formatMinor } from '@/lib/marketplace/pricing'
import { mentorDirectoryCached } from '@/lib/mentors/public-cache'
import { filterDirectory, parseDirectoryQuery, type DirectoryQuery } from '@/lib/mentors/pure'
import { OFFERING_LABELS, OFFERING_TYPES, type PublicMentor } from '@/lib/mentors/types'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT, type PublicTranslator } from '@/lib/i18n/public-server'

// Mentor directory for every language (English: app/mentors/page.tsx, hi / te:
// app/[lang]/mentors). Mentor profiles stay as the mentors wrote them.

export type SP = Promise<Record<string, string | string[] | undefined>>

export async function mentorsMetadata(searchParams: SP, locale: Locale): Promise<Metadata> {
  const t = publicT(locale)
  const q = parseDirectoryQuery(await searchParams)
  return buildMetadata({
    title: t('hubs.mentorsMetaTitle'),
    description: t('hubs.mentorsMetaDescription'),
    path: '/mentors',
    locale,
    kind: 'product',
    noIndex: q.q || q.skill || q.company || q.type || q.sort ? 'follow' : false,
  })
}

function href(root: string, q: DirectoryQuery, patch: Partial<DirectoryQuery>): string {
  const n = { ...q, ...patch }
  const p = new URLSearchParams()
  for (const k of ['q', 'skill', 'company', 'type', 'sort'] as const) if (n[k]) p.set(k, String(n[k]))
  const s = p.toString()
  return s ? `${root}?${s}` : root
}

function fromPrice(m: PublicMentor, t: PublicTranslator): string {
  const parts = (['INR', 'USD'] as const).filter((c) => m.from_price[c] !== undefined).map((c) => formatMinor(m.from_price[c] as number, c))
  return parts.length ? t('hubs.fromPrice', { price: parts.join(' / ') }) : ''
}

export async function MentorsView({ searchParams, locale }: { searchParams: SP; locale: Locale }) {
  const t = publicT(locale)
  const root = localizedPath('/mentors', locale)
  const q = parseDirectoryQuery(await searchParams)
  let all: PublicMentor[] = []
  let failed = false
  try { all = await mentorDirectoryCached() } catch (e) { failed = true; console.error('[mentors] directory failed', (e as Error)?.message) }
  const list = filterDirectory(all, q)
  const field = 'h-11 w-full rounded-xl border border-cs-grid bg-cs-sheet px-3 text-sm text-cs-ink outline-none focus:border-cs-accent/50 focus:ring-2 focus:ring-cs-accent/30'
  return (
    <PublicPageWrapper>
      <PageHero
        title={t('hubs.mentorsTitle')}
        lead={t('hubs.mentorsLead')}
        actions={
          <form action={root} role="search" className="flex w-full max-w-xl gap-2">
            <label className="relative block flex-1">
              <span className="sr-only">{t('hubs.mentorsSearch')}</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cs-ink-soft" aria-hidden />
              <input type="search" name="q" defaultValue={q.q} placeholder={t('hubs.mentorsSearchPlaceholder')} className="h-12 w-full rounded-full border border-cs-grid bg-cs-sheet pl-11 pr-4 text-sm text-cs-ink outline-none placeholder:text-cs-ink-soft/70 focus:border-cs-accent/50 focus:ring-2 focus:ring-cs-accent/30" />
            </label>
            <button type="submit" className="h-12 rounded-full bg-cs-accent px-5 text-sm font-semibold text-cs-accent-ink hover:brightness-110">{t('common.search')}</button>
          </form>
        }
        art={<HeroIllustration spot="courses" />}
      />
      <div className="mx-auto w-full min-w-0 max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label={t('hubs.mentorsTypes')} className="mb-6 flex flex-wrap gap-2">
          <Chip href={href(root, q, { type: undefined })} active={!q.type} label={t('hubs.mentorsAllSessions')} />
          {OFFERING_TYPES.map((x) => <Chip key={x} href={href(root, q, { type: x })} active={q.type === x} label={t.dyn(`hubs.offering:${x}`, OFFERING_LABELS[x])} />)}
        </nav>
        <form action={root} className="mb-8 grid gap-3 sm:grid-cols-4">
          {q.q && <input type="hidden" name="q" value={q.q} />}
          {q.type && <input type="hidden" name="type" value={q.type} />}
          <label className="text-sm"><span className="mb-1 block font-medium text-cs-ink">{t('hubs.skill')}</span><input name="skill" defaultValue={q.skill} placeholder={t('hubs.skillPlaceholder')} className={field} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium text-cs-ink">{t('public.footCompany')}</span><input name="company" defaultValue={q.company} placeholder={t('hubs.companyPlaceholder')} className={field} /></label>
          <label className="text-sm"><span className="mb-1 block font-medium text-cs-ink">{t('hubs.sortBy')}</span>
            <select name="sort" defaultValue={q.sort ?? 'rating'} className={field}><option value="rating">{t('hubs.sortTopRated')}</option><option value="price">{t('hubs.sortPriceLow')}</option><option value="experience">{t('hubs.sortExperience')}</option></select>
          </label>
          <div className="flex items-end"><button type="submit" className="h-11 w-full rounded-full border border-cs-grid bg-cs-sheet text-sm font-semibold text-cs-ink hover:border-cs-accent">{t('hubs.apply')}</button></div>
        </form>
        {failed ? (
          <EmptyState illustration="error" title={t('hubs.mentorsLoadFailed')} description={t('publicPages.refreshSoon')} />
        ) : list.length === 0 ? (
          <EmptyState title={all.length ? t('hubs.mentorsNoMatch') : t('hubs.mentorsNone')} description={all.length ? t('hubs.mentorsNoMatchBody') : t('hubs.mentorsNoneBody')}
            actionLabel={all.length ? t('hubs.clearFilters') : t('hubs.mentorsBecome')} actionHref={all.length ? root : '/dashboard/mentor'} />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <li key={m.slug}>
                <Link href={`/mentors/${m.slug}`} className="flex h-full flex-col rounded-3xl border border-cs-grid bg-cs-sheet p-5 transition-colors duration-200 hover:border-cs-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cs-accent/40 motion-reduce:transition-none">
                  <div className="flex items-center gap-3">
                    {m.avatar_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={m.avatar_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                      : <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cs-accent/10 text-lg font-bold text-cs-accent-text">{m.display_name.slice(0, 1).toUpperCase()}</span>}
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 truncate font-semibold text-cs-ink">{m.display_name}<BadgeCheck className="h-4 w-4 shrink-0 text-cs-accent-text" aria-label={t('hubs.mentorsVerified')} /></p>
                      <p className="line-clamp-2 text-sm text-cs-ink-soft">{m.headline}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">{m.skills.slice(0, 5).map((s) => <span key={s} className="rounded-full bg-cs-accent/10 px-2.5 py-0.5 text-xs text-cs-accent-text">{s}</span>)}</div>
                  {m.companies.length > 0 && <p className="mt-3 text-xs text-cs-ink-soft">{t('hubs.mentorsWorkedAt', { companies: m.companies.slice(0, 3).join(', ') })}</p>}
                  <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
                    <span className="inline-flex items-center gap-1 text-cs-ink">{m.rating.count ? <><Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden /><span className="tabular-nums">{m.rating.avg.toFixed(1)}</span><span className="text-cs-ink-soft">({m.rating.count})</span></> : <span className="text-cs-ink-soft">{t('hubs.mentorsNew')}</span>}</span>
                    <span className="font-semibold tabular-nums text-cs-ink">{fromPrice(m, t)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicPageWrapper>
  )
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`inline-flex min-h-[40px] items-center rounded-full border px-4 text-sm ${active ? 'border-cs-accent bg-cs-accent/10 font-semibold text-cs-accent-text' : 'border-cs-grid text-cs-ink hover:border-cs-accent/50'}`}>{label}</Link>
  )
}

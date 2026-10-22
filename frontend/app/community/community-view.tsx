/**
 * Public forum pages for every language (English: app/community/**, Hindi /
 * Telugu: app/[lang]/community/**). The chrome follows the URL language;
 * posts stay in the language they were written in (marked with `lang`).
 * Data comes from the tag-purged data cache (lib/community/public-cache).
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MessagesSquare } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { HeroIllustration, PageHero } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { ThreadView } from '@/components/community/thread-view'
import { buildMetadata } from '@/lib/seo/metadata'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { communityT, type LooseT } from '@/lib/community/i18n-server'
import { categoriesCached, categoryCached, threadCached, threadsCached } from '@/lib/community/public-cache'
import type { ThreadSort, ThreadSummary } from '@/lib/community/service'
import { isThreadId } from '@/lib/community/pure'

export type SP = Promise<Record<string, string | string[] | undefined>>

const SORTS: ThreadSort[] = ['hot', 'new', 'top', 'unanswered']
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const parseSort = (v: unknown): ThreadSort => (SORTS as string[]).includes(String(v)) ? (v as ThreadSort) : 'hot'
const parsePage = (v: unknown) => Math.max(1, Math.min(50, Math.floor(Number(v)) || 1))

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return <Link href={href} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm ${active ? 'border-cs-accent bg-cs-accent/10 font-semibold text-cs-accent-text' : 'border-cs-grid text-cs-ink hover:border-cs-accent/50'}`}>{label}</Link>
}

function ThreadList({ threads, t, locale }: { threads: ThreadSummary[]; t: LooseT; locale: Locale }) {
  const df = new Intl.DateTimeFormat(locale === 'en' ? 'en-IN' : locale, { dateStyle: 'medium' })
  return (
    <ul className="divide-y divide-cs-grid overflow-hidden rounded-3xl border border-cs-grid bg-cs-sheet">
      {threads.map((th) => (
        <li key={th.id}>
          <Link href={localizedPath(`/community/t/${th.id}`, locale)} className="flex gap-4 px-5 py-4 transition-colors hover:bg-cs-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cs-accent/40 motion-reduce:transition-none">
            <span className="w-14 shrink-0 text-center"><span className="block text-lg font-semibold tabular-nums text-cs-ink">{th.score}</span><span className="text-xs text-cs-ink-soft">{t('votesShort')}</span></span>
            <span className="min-w-0 flex-1">
              <span lang={th.lang !== 'other' ? th.lang : undefined} className="block font-semibold text-cs-ink">{th.pinned ? `${t('pinned')} · ` : ''}{th.title}</span>
              {th.excerpt && <span lang={th.lang !== 'other' ? th.lang : undefined} className="mt-0.5 line-clamp-1 block text-sm text-cs-ink-soft">{th.excerpt}</span>}
              <span className="mt-1 block text-xs text-cs-ink-soft">
                {t(`threadKind_${th.kind}`)} · {t('replyCount', { count: th.reply_count })}{th.answered ? ` · ${t('answered')}` : ''} · {th.author_name} · <span className="tabular-nums">{df.format(new Date(th.last_activity_at))}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export async function communityMetadata(locale: Locale): Promise<Metadata> {
  const t = await communityT(locale)
  return buildMetadata({ title: t('forumTitle'), description: t('forumLead'), path: '/community', locale })
}

export async function CommunityHome({ locale, searchParams }: { locale: Locale; searchParams: SP }) {
  const t = await communityT(locale)
  const sp = await searchParams
  const sort = parseSort(one(sp.sort))
  const [cats, list] = await Promise.all([categoriesCached(), threadsCached(null, sort, 1)])
  const root = localizedPath('/community', locale)
  const groups = (['general', 'company', 'course'] as const).map((k) => ({ k, items: cats.filter((c) => c.kind === k) })).filter((g) => g.items.length)
  return (
    <PublicPageWrapper>
      <PageHero title={t('forumTitle')} lead={t('forumLead')} art={<HeroIllustration spot="courses" />}
        actions={<Link href="/dashboard/community/new" className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-cs-accent px-6 text-sm font-semibold text-cs-accent-ink hover:brightness-110"><MessagesSquare className="h-4 w-4" aria-hidden />{t('askQuestion')}</Link>} />
      <div className="mx-auto grid w-full min-w-0 max-w-[1200px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <section className="min-w-0 space-y-4">
          <nav aria-label={t('sortBy')} className="flex flex-wrap gap-2">
            {SORTS.map((s) => <Chip key={s} href={s === 'hot' ? root : `${root}?sort=${s}`} active={sort === s} label={t(`sort_${s}`)} />)}
          </nav>
          {list.threads.length ? <ThreadList threads={list.threads} t={t} locale={locale} /> : <EmptyState title={t('noThreads')} description={t('noThreadsHint')} actionLabel={t('askQuestion')} actionHref="/dashboard/community/new" />}
        </section>
        <aside className="space-y-6" aria-label={t('categories')}>
          {groups.map((g) => (
            <div key={g.k} className="space-y-2">
              <h2 className="text-sm font-semibold text-cs-ink">{t(`catGroup_${g.k}`)}</h2>
              <ul className="space-y-1">
                {g.items.slice(0, g.k === 'general' ? 10 : 12).map((c) => (
                  <li key={c.id}><Link href={localizedPath(`/community/c/${c.slug}`, locale)} className="flex min-h-[40px] items-center justify-between rounded-xl px-3 text-sm text-cs-ink hover:bg-cs-accent/5"><span className="truncate">{c.name}</span><span className="tabular-nums text-cs-ink-soft">{c.thread_count}</span></Link></li>
                ))}
              </ul>
            </div>
          ))}
          <Link href="/dashboard/community" className="block rounded-2xl border border-cs-grid bg-cs-sheet p-4 text-sm text-cs-ink hover:border-cs-accent/50"><span className="font-semibold">{t('studyGroups')}</span><span className="mt-1 block text-cs-ink-soft">{t('studyGroupsLead')}</span></Link>
        </aside>
      </div>
    </PublicPageWrapper>
  )
}

export async function categoryMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const t = await communityT(locale)
  const c = await categoryCached(slug).catch(() => null)
  if (!c) return { title: t('forumTitle'), robots: { index: false } }
  return buildMetadata({ title: `${c.name} · ${t('forumTitle')}`, description: c.description || t('forumLead'), path: `/community/c/${slug}`, locale })
}

export async function CategoryView({ slug, locale, searchParams }: { slug: string; locale: Locale; searchParams: SP }) {
  const c = await categoryCached(slug)
  if (!c) notFound()
  const t = await communityT(locale)
  const sp = await searchParams
  const sort = parseSort(one(sp.sort))
  const page = parsePage(one(sp.page))
  const list = await threadsCached(c.id, sort, page)
  const root = localizedPath(`/community/c/${slug}`, locale)
  const q = (s: ThreadSort, p = 1) => { const u = new URLSearchParams(); if (s !== 'hot') u.set('sort', s); if (p > 1) u.set('page', String(p)); const x = u.toString(); return x ? `${root}?${x}` : root }
  return (
    <PublicPageWrapper>
      <PageHero title={c.name} lead={c.description}
        actions={<Link href={`/dashboard/community/new?category=${encodeURIComponent(c.id)}`} className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-cs-accent px-6 text-sm font-semibold text-cs-accent-ink hover:brightness-110"><MessagesSquare className="h-4 w-4" aria-hidden />{t('askQuestion')}</Link>} />
      <div className="mx-auto w-full min-w-0 max-w-[1000px] space-y-4 px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label={t('breadcrumbs')} className="text-sm text-cs-ink-soft"><Link href={localizedPath('/community', locale)} className="hover:text-cs-ink">{t('forumTitle')}</Link> / <span className="text-cs-ink">{c.name}</span></nav>
        <nav aria-label={t('sortBy')} className="flex flex-wrap gap-2">{SORTS.map((s) => <Chip key={s} href={q(s)} active={sort === s} label={t(`sort_${s}`)} />)}</nav>
        {list.threads.length ? <ThreadList threads={list.threads} t={t} locale={locale} /> : <EmptyState title={t('noThreads')} description={t('noThreadsHint')} actionLabel={t('askQuestion')} actionHref={`/dashboard/community/new?category=${encodeURIComponent(c.id)}`} />}
        {(page > 1 || list.hasMore) && (
          <nav aria-label={t('pages')} className="flex justify-between">
            {page > 1 ? <Link className="text-sm font-medium text-cs-accent-text" href={q(sort, page - 1)}>{t('newer')}</Link> : <span />}
            {list.hasMore && <Link className="text-sm font-medium text-cs-accent-text" href={q(sort, page + 1)}>{t('older')}</Link>}
          </nav>
        )}
      </div>
    </PublicPageWrapper>
  )
}

export async function threadMetadata(id: string, locale: Locale): Promise<Metadata> {
  const t = await communityT(locale)
  const th = isThreadId(id) ? await threadCached(id).catch(() => null) : null
  if (!th) return { title: t('forumTitle'), robots: { index: false } }
  return buildMetadata({ title: th.title, description: th.excerpt || t('forumLead'), path: `/community/t/${id}`, locale, type: 'article', publishedTime: th.created_at, modifiedTime: th.last_activity_at })
}

export async function ThreadPage({ id, locale }: { id: string; locale: Locale }) {
  const th = isThreadId(id) ? await threadCached(id) : null
  if (!th) notFound()
  const t = await communityT(locale)
  return (
    <PublicPageWrapper>
      <div className="mx-auto w-full min-w-0 max-w-[1000px] space-y-4 px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label={t('breadcrumbs')} className="text-sm text-cs-ink-soft">
          <Link href={localizedPath('/community', locale)} className="hover:text-cs-ink">{t('forumTitle')}</Link> / <Link href={localizedPath(`/community/c/${th.category.slug}`, locale)} className="hover:text-cs-ink">{th.category.name}</Link>
        </nav>
        <ThreadView id={th.id} initial={th} signInHref={`/login?next=${encodeURIComponent(`/community/t/${th.id}`)}`} />
      </div>
    </PublicPageWrapper>
  )
}

/**
 * /digest and /digest/<date> — the daily digest (English here, /hi and /te
 * through app/[lang]/digest). Sections per category with item cards: title
 * (always in its original language), 1–2 line summary, key-fact chips
 * (date, deadline, prize, mode, region), source credit and links. Rendered
 * per request from cached data (lib/digest/cached, purged on publish).
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CalendarDays, ExternalLink, Rss } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { NotifyBox } from '@/components/events-feed/notify-box'
import { JsonLd } from '@/components/seo/json-ld'
import { digestCached, digestListCached } from '@/lib/digest/cached'
import { getDigestConfig } from '@/lib/digest/store'
import { DEFAULT_TEMPLATES, fmtDay, renderDigest, type DigestTemplates, type RenderedItem } from '@/lib/digest/templates'
import { isDigestDate } from '@/lib/digest/schedule'
import { newsTopicLabel } from '@/lib/signals/feeds'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, compact } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT, type PublicTranslator } from '@/lib/i18n/public-server'

export type SP = Promise<Record<string, string | string[] | undefined>>

const templatesFor = async (): Promise<DigestTemplates> => (await getDigestConfig().catch(() => null))?.templates ?? DEFAULT_TEMPLATES
const lang = (l: Locale) => (l === 'hi' || l === 'te' ? l : 'en')

export async function digestListMetadata(locale: Locale): Promise<Metadata> {
  const t = publicT(locale)
  const base = buildMetadata({ title: t('seo.title:/digest'), description: t('seo.description:/digest'), path: '/digest', locale })
  return { ...base, alternates: { ...base.alternates, types: { 'application/rss+xml': '/digest/rss.xml' } } }
}

export async function digestDetailMetadata(date: string, locale: Locale): Promise<Metadata> {
  const t = publicT(locale)
  const doc = isDigestDate(date) ? await digestCached(date).catch(() => null) : null
  if (!doc) return { title: t('hubs.digestNotFound'), robots: { index: false, follow: true } }
  const day = fmtDay(doc.date, lang(locale))
  return buildMetadata({
    title: t('hubs.digestDetailTitle', { date: day }),
    description: t('hubs.digestDetailDescription', { date: day, count: doc.items.length }),
    path: `/digest/${doc.date}`, locale, kind: 'article', type: 'article', publishedTime: doc.published_at || undefined, modifiedTime: doc.updated_at,
  })
}

function topicLabel(t: PublicTranslator, it: RenderedItem): string | null {
  if (!it.topic) return null
  if (it.category === 'news') return t.dyn(`hubs.newsTopic:${it.topic}`, newsTopicLabel(it.topic))
  return null
}

function ItemCard({ it, t }: { it: RenderedItem; t: PublicTranslator }) {
  const topic = topicLabel(t, it)
  const internal = it.url.replace(/^https?:\/\/[^/]+/, '') || '/'
  return (
    <article className="flex h-full flex-col gap-2 rounded-3xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:hover:translate-y-0 dark:shadow-none">
      {topic && <p className="text-xs font-semibold text-primary">{topic}</p>}
      <h3 className="text-base font-semibold leading-snug text-foreground">
        <Link href={internal} className="rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{it.title}</Link>
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{it.summary}</p>
      {it.chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('hubs.digestDetails')}>
          {it.chips.map((c) => (
            <li key={c.key} className="inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-background px-2.5 text-xs text-foreground">
              {c.label && <span className="text-muted-foreground">{c.label}</span>}
              <span className="font-medium">{c.value}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
        <span>{t('hubs.digestSource', { source: it.source_name })}</span>
        <span className="flex items-center gap-3">
          <Link href={internal} className="inline-flex min-h-9 items-center gap-1 rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('hubs.digestDetails')} <ArrowRight className="h-3 w-3" aria-hidden /></Link>
          {it.source_url && (
            <a href={it.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-9 items-center gap-1 rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t('hubs.digestOriginal')} <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </span>
      </div>
    </article>
  )
}

const rssLink = (t: PublicTranslator) => (
  <Link href="/digest/rss.xml" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <Rss className="h-4 w-4" aria-hidden /> {t('hubs.rssFeed')}
  </Link>
)

/** /digest — the latest digest's sections up top, past digests below. */
export async function DigestListView({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  const l = lang(locale)
  const root = localizedPath('/digest', locale)
  const [list, site, tpls] = await Promise.all([digestListCached(1).catch(() => ({ rows: [], total: 0 })), getSiteOrigin(), templatesFor()])
  const latest = list.rows[0] ? await digestCached(list.rows[0].date).catch(() => null) : null
  const view = latest ? renderDigest(latest, l, tpls) : null
  const jsonLd = [
    compact({
      '@context': 'https://schema.org', '@type': 'ItemList', name: t('hubs.digestListName'), ...(locale !== 'en' ? { inLanguage: locale } : {}),
      itemListElement: list.rows.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site}${localizedPath(`/digest/${d.date}`, locale)}`, name: fmtDay(d.date, l) })),
    }),
    breadcrumbJsonLd([{ name: t('marketing.crumbHome'), path: localizedPath('/', locale) }, { name: t('public.navDigest'), path: root }], site),
  ]
  return (
    <PublicPageWrapper>
      <JsonLd data={jsonLd} />
      <PageHero title={view?.heading ?? t('public.navDigest')} lead={t('hubs.digestLead')} actions={rssLink(t)} />
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8">
        <div className="min-w-0 space-y-10">
          {!view ? (
            <EmptyState illustration="search" title={t('hubs.digestEmpty')} description={t('hubs.digestEmptyBody')} />
          ) : (
            <>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{view.intro}</p>
              {view.sections.map((s) => (
                <section key={s.category} id={s.category} aria-labelledby={`h-${s.category}`} className="scroll-mt-24 space-y-4">
                  <h2 id={`h-${s.category}`} className="text-xl font-semibold tracking-tight text-foreground">{s.heading}</h2>
                  <div className="cs-stagger grid gap-4 sm:grid-cols-2">{s.items.map((it) => <ItemCard key={it.key} it={it} t={t} />)}</div>
                </section>
              ))}
              <p className="text-xs leading-relaxed text-muted-foreground">{view.outro}</p>
              <Link href={localizedPath(`/digest/${view.date}`, locale)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t('hubs.digestRead')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </>
          )}
          {list.rows.length > 1 && (
            <section aria-labelledby="digest-archive" className="space-y-3">
              <h2 id="digest-archive" className="text-lg font-semibold text-foreground">{t('hubs.digestArchive')}</h2>
              <ul className="divide-y divide-border rounded-3xl border border-border/70 bg-card">
                {list.rows.slice(1).map((d) => (
                  <li key={d.date}>
                    <Link href={localizedPath(`/digest/${d.date}`, locale)} className="flex min-h-12 flex-col gap-1 px-5 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex items-center gap-2 font-medium text-foreground"><CalendarDays className="h-4 w-4 text-primary" aria-hidden />{fmtDay(d.date, l)}</span>
                      <span className="truncate text-sm text-muted-foreground">{t('hubs.digestPicks', { count: d.count })} · {d.top.slice(0, 2).map((x) => x.title).join(' · ')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <NotifyBox topic="digest" />
          <p className="px-2 text-xs leading-relaxed text-muted-foreground">{t('hubs.digestNote')}</p>
        </aside>
      </div>
    </PublicPageWrapper>
  )
}

/** /digest/<date> — one day's digest. Returns null when there is none (caller → notFound). */
export async function DigestDetailView({ date, locale }: { date: string; locale: Locale }) {
  if (!isDigestDate(date)) return null
  const doc = await digestCached(date)
  if (!doc) return null
  const t = publicT(locale)
  const l = lang(locale)
  const [site, tpls] = await Promise.all([getSiteOrigin(), templatesFor()])
  const view = renderDigest(doc, l, tpls)
  const path = localizedPath(`/digest/${doc.date}`, locale)
  const jsonLd = [
    compact({
      '@context': 'https://schema.org', '@type': 'NewsArticle', headline: view.heading.slice(0, 110), description: view.intro,
      url: `${site}${path}`, datePublished: doc.published_at || undefined, dateModified: doc.updated_at, inLanguage: locale,
      publisher: { '@type': 'Organization', name: 'CodeSpectra', url: site },
      mainEntity: {
        '@type': 'ItemList', numberOfItems: view.count,
        itemListElement: view.sections.flatMap((s) => s.items).sort((a, b) => a.rank - b.rank).map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: it.url, name: it.title.slice(0, 110) })),
      },
    }),
    breadcrumbJsonLd([{ name: t('marketing.crumbHome'), path: localizedPath('/', locale) }, { name: t('public.navDigest'), path: localizedPath('/digest', locale) }, { name: view.date_label, path }], site),
  ]
  return (
    <PublicPageWrapper>
      <JsonLd data={jsonLd} />
      <PageHero title={view.heading} lead={view.intro} actions={rssLink(t)} />
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8">
        <div className="min-w-0 space-y-10">
          <nav aria-label={t('hubs.digestInSections')} className="flex flex-wrap gap-2">
            {view.sections.map((s) => (
              <a key={s.category} href={`#${s.category}`} className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3.5 text-sm text-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {s.heading} <span className="ml-1.5 text-muted-foreground tabular-nums">{s.items.length}</span>
              </a>
            ))}
          </nav>
          {view.sections.map((s) => (
            <section key={s.category} id={s.category} aria-labelledby={`h-${s.category}`} className="scroll-mt-24 space-y-4">
              <h2 id={`h-${s.category}`} className="text-xl font-semibold tracking-tight text-foreground">{s.heading}</h2>
              <div className="cs-stagger grid gap-4 sm:grid-cols-2">{s.items.map((it) => <ItemCard key={it.key} it={it} t={t} />)}</div>
            </section>
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">{view.outro}</p>
          <Link href={localizedPath('/digest', locale)} className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('hubs.digestAllDigests')} <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <NotifyBox topic="digest" />
          <p className="px-2 text-xs leading-relaxed text-muted-foreground">{t('hubs.digestNote')}</p>
        </aside>
      </div>
    </PublicPageWrapper>
  )
}

'use client'

/**
 * Landing "Learn" section: featured Learn posts first, then the latest. Hidden
 * entirely until at least one post is published (no placeholder content).
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ENGLISH_CARD_LABELS, LearnPostCardView, type CardLabels } from '@/components/learn/post-card'
import type { LearnPostCard } from '@/lib/learn/types'
import { useT } from '@/lib/i18n/client'
import { useLocalizedHref } from '@/components/i18n/public-language'

export function LearnSection({ initialPosts }: { initialPosts?: LearnPostCard[] } = {}) {
  const [posts, setPosts] = useState<LearnPostCard[]>(initialPosts ?? [])
  const { t, td, locale } = useT()
  const lp = useLocalizedHref()
  const labels: CardLabels = locale === 'en' ? ENGLISH_CARD_LABELS : {
    ...ENGLISH_CARD_LABELS,
    category: (id, fallback) => td(`learn.category:${id}`, fallback),
    level: (l) => td(`public.level:${l}`, l),
    minRead: (n) => t('learn.minRead', { count: n }),
    series: (s) => t('learn.seriesLabel', { series: s }),
  }

  useEffect(() => {
    // Server-loaded (landing page) — already in the HTML, no client refetch.
    if (initialPosts) return
    let alive = true
    const get = (qs: string) => fetch(`/api/learn?${qs}`).then((r) => (r.ok ? r.json() : { items: [] })).then((d) => (d.items ?? []) as LearnPostCard[]).catch(() => [] as LearnPostCard[])
    Promise.all([get('featured=1&limit=3'), get('limit=3')]).then(([featured, latest]) => {
      if (!alive) return
      const seen = new Set<string>()
      setPosts([...featured, ...latest].filter((p) => !seen.has(p.slug) && seen.add(p.slug)).slice(0, 3))
    })
    return () => { alive = false }
  }, [initialPosts])

  if (posts.length === 0) return null

  return (
    <section className="border-b border-cs-grid" aria-labelledby="learn-heading">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-cs-accent-text">{t('public.navLearn')}</p>
            <h2 id="learn-heading" className="cs-heading mt-3 max-w-[20ch] text-4xl sm:text-5xl">{t('public.learnSectionTitle')}</h2>
            <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-cs-ink-soft">{t('public.learnSectionLead')}</p>
          </div>
          <Link href={lp('/learn')} className="inline-flex h-12 items-center justify-center rounded-md border border-cs-ink/25 px-6 text-[15px] font-semibold text-cs-ink transition-colors hover:border-cs-ink">
            {t('public.learnSectionAll')}
          </Link>
        </div>
        <div className="cs-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {posts.map((p) => <LearnPostCardView key={p.slug} post={p} labels={labels} />)}
        </div>
      </div>
    </section>
  )
}

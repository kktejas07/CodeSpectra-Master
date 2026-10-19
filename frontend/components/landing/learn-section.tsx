'use client'

/**
 * Landing "Learn" section: featured Learn posts first, then the latest. Hidden
 * entirely until at least one post is published (no placeholder content).
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LearnPostCardView } from '@/components/learn/post-card'
import type { LearnPostCard } from '@/lib/learn/types'

export function LearnSection({ initialPosts }: { initialPosts?: LearnPostCard[] } = {}) {
  const [posts, setPosts] = useState<LearnPostCard[]>(initialPosts ?? [])

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
            <p className="text-sm font-semibold text-cs-accent-text">Learn</p>
            <h2 id="learn-heading" className="cs-heading mt-3 max-w-[20ch] text-4xl sm:text-5xl">Free explainers for every coding skill</h2>
            <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-cs-ink-soft">
              Algorithms, system design, patterns and engineering practices, with code you can run and problems to practise.
            </p>
          </div>
          <Link href="/learn" className="inline-flex h-12 items-center justify-center rounded-md border border-cs-ink/25 px-6 text-[15px] font-semibold text-cs-ink transition-colors hover:border-cs-ink">
            Browse all posts
          </Link>
        </div>
        <div className="cs-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {posts.map((p) => <LearnPostCardView key={p.slug} post={p} />)}
        </div>
      </div>
    </section>
  )
}

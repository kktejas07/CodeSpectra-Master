'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, Loader2, Newspaper } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonText, SkeletonList } from '@/components/ui/skeleton-boneyard'

type Post = {
  slug: string
  title: string
  excerpt?: string
  category?: string
  read_minutes?: number
  published_at?: string
}

export default function ArticlesNewsroomPage() {
  const gate = usePageGuard('user')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/blog?limit=48', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setPosts(
          (d.items || []).map((p: Record<string, unknown>) => ({
            slug: String(p.slug || ''),
            title: String(p.title || ''),
            excerpt: String(p.excerpt || ''),
            category: String(p.category || ''),
            read_minutes: Number(p.read_minutes || 5),
            published_at: (p.published_at as string) || undefined,
          })),
        )
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [gate.ready])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const articlesTour: TourStep[] = [
        {
          target: '[data-tour="articles-header"]',
          title: 'Articles & Newsroom',
          description: 'Read expert insights, product updates, and career signals from CodeSpectra.',
          position: 'bottom',
        },
        {
          target: '[data-tour="open-public-newsroom"]',
          title: 'Open Public Newsroom',
          description: 'Visit the public newsroom to see all published articles.',
          position: 'bottom',
        },
        {
          target: '[data-tour="articles-grid"]',
          title: 'Article List',
          description: 'Browse through the latest articles and click to read full content.',
          position: 'bottom',
        },
      ]
      autoPlayPageTour('articles', articlesTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready || loading) {
    return (
      <div className="w-full space-y-6">
        <SkeletonText lines={2} />
        <SkeletonList count={6} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div data-tour="articles-header">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Newspaper className="h-8 w-8 text-primary" /> Articles / Newsroom
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Expert insights, product updates, and career Signals from CodeSpectra.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" data-tour="open-public-newsroom">
          <Link href="/blog" target="_blank">
            Open public newsroom
          </Link>
        </Button>
      </div>

      {posts.length === 0 ? (
        <EmptyState
          variant="default"
          title="No published articles yet"
          description="Superadmins can publish from Admin → Blog / Signals. New posts appear here automatically."
          actionLabel="Open public newsroom"
          actionHref="/blog"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" data-tour="articles-grid">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`}>
              <Card className="h-full p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
                {p.category ? (
                  <Badge variant="secondary" className="mb-2">
                    {p.category}
                  </Badge>
                ) : null}
                <p className="font-semibold leading-snug">{p.title}</p>
                {p.excerpt ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>
                ) : null}
                <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {p.read_minutes || 5} min
                  {p.published_at ? ` · ${formatDate(p.published_at)}` : ''}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

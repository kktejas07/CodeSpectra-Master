'use client'
import { useLocaleDates } from '@/lib/i18n/use-dates'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, Loader2, Newspaper } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader, Panel, BentoGrid } from '@/components/app/page-kit'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { SkeletonText, SkeletonList } from '@/components/ui/skeleton-boneyard'
import { useT } from '@/lib/i18n/client'

type Post = {
  slug: string
  href: string
  title: string
  excerpt?: string
  category?: string
  read_minutes?: number
  published_at?: string
}

export default function ArticlesNewsroomPage() {
  const { formatDate } = useLocaleDates()
  const { t } = useT()
  const gate = usePageGuard('user')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    if (!gate.ready) return
    setLoading(true)
    setLoadError(false)
    fetch('/api/blog?limit=48', { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((d) => {
        setPosts(
          (d.items || []).map((p: Record<string, unknown>) => ({
            slug: String(p.slug || ''),
            href: typeof p.public_path === 'string' && p.public_path.startsWith('/') ? p.public_path : `/learn/${encodeURIComponent(String(p.slug || ''))}`,
            title: String(p.title || ''),
            excerpt: String(p.excerpt || ''),
            category: String(p.category || ''),
            read_minutes: Number(p.read_minutes || 5),
            published_at: (p.published_at as string) || undefined,
          })),
        )
      })
      .catch(() => { setPosts([]); setLoadError(true) })
      .finally(() => setLoading(false))
  }, [gate.ready, reloadKey])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready) {
      const articlesTour: TourStep[] = [
        {
          target: '[data-tour="articles-header"]',
          title: t('learning.articlesNewsroom'),
          description: t('learning.readExpertInsightsProductUpdatesAnd9ff'),
          position: 'bottom',
        },
        {
          target: '[data-tour="open-public-newsroom"]',
          title: t('learning.openInLearn'),
          description: t('learning.teamPostsArePublicInLearnd2d'),
          position: 'bottom',
        },
        {
          target: '[data-tour="articles-grid"]',
          title: t('learning.articleList'),
          description: t('learning.browseThroughTheLatestArticlesAnd5be'),
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
      <PageHeader
        illustration="courses"
        className="mb-0"
        icon={<Newspaper aria-hidden />}
        title={<span data-tour="articles-header">{t('learning.articles')}</span>}
        description={t('learning.insightsProductUpdatesAndCareerAdvice878')}
        actions={
          <Button asChild variant="outline" size="sm" data-tour="open-public-newsroom">
            <Link href="/learn?source=team" target="_blank">{t('learning.openInLearn')}</Link>
          </Button>
        }
      />

      {loadError ? (
        <EmptyState
          illustration="error"
          title={t('learning.couldntLoadArticles')}
          description={t('learning.checkYourConnectionAndTryAgain')}
          actionLabel={t('common.tryAgain')}
          onAction={() => setReloadKey((k) => k + 1)}
        />
      ) : posts.length === 0 ? (
        <EmptyState illustration="courses"
          variant="default"
          title={t('learning.noPublishedArticlesYet')}
          description={t('learning.newArticlesWillShowUpHere920')}
          actionLabel={t('learning.openLearn')}
          actionHref="/learn"
        />
      ) : (
        <div data-tour="articles-grid">
        <BentoGrid className="lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.slug} href={p.href}>
              <Panel interactive className="h-full p-5">
                {p.category ? (
                  <Badge variant="secondary" className="mb-2">
                    {p.category}
                  </Badge>
                ) : null}
                <p className="font-semibold leading-snug text-foreground">{p.title}</p>
                {p.excerpt ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>
                ) : null}
                <p className="mt-3 inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {p.read_minutes || 5} min
                  {p.published_at ? ` · ${formatDate(p.published_at)}` : ''}
                </p>
              </Panel>
            </Link>
          ))}
        </BentoGrid>
        </div>
      )}
    </div>
  )
}

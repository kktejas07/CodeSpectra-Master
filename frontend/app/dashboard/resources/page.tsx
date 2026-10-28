'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, FileText, GraduationCap, Library, Loader2, Shield } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader, Panel, Section, BentoGrid } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { EbookCoverCard, type EbookCardData } from '@/components/resources/ebook-cover-card'
import { SkeletonCard, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'

const LINK_RESOURCES = (t: Translator) => ([
  {
    title: t('learning.platformDocumentation'),
    description: t('learning.gettingStartedProductOverviewApiAnd436'),
    href: '/docs',
    tag: 'Docs',
    icon: BookOpen,
    minutes: 10,
  },
  {
    title: t('learning.userHandbook'),
    description: t('learning.dayToDayWorkflowsInsideThe31a'),
    href: '/docs/user/dashboard-guide',
    tag: 'Guide',
    icon: GraduationCap,
    minutes: 12,
  },
  {
    title: t('learning.resumeBuilder'),
    description: t('learning.craftAStandoutResumeInMinutes'),
    href: '/dashboard/resumes',
    tag: 'Tool',
    icon: FileText,
    minutes: 8,
  },
  {
    title: t('learning.securityPrivacy'),
    description: t('learning.howCodespectraProtectsAssessmentsAndPers9aa'),
    href: '/security',
    tag: 'Policy',
    icon: Shield,
    minutes: 6,
  },
  {
    title: t('learning.newsroomArticles'),
    description: t('learning.longFormUpdatesAndCareerSignals'),
    href: '/dashboard/articles',
    tag: 'Editorial',
    icon: Library,
    minutes: 5,
  },
])

export default function ResourcesPage() {
  const { t } = useT()
  const gate = usePageGuard('user')
  const [ebooks, setEbooks] = useState<EbookCardData[]>([])
  const [loadingEbooks, setLoadingEbooks] = useState(true)
  const [ebooksError, setEbooksError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!gate.ready) return
    setLoadingEbooks(true)
    setEbooksError(false)
    fetch('/api/resources/ebooks', { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((d) =>
        setEbooks(
          (d.items || []).map((e: Record<string, unknown>) => ({
            slug: String(e.slug || ''),
            title: String(e.title || ''),
            subtitle: e.subtitle ? String(e.subtitle) : undefined,
            topic: e.topic ? String(e.topic) : undefined,
            coverTheme: (e.coverTheme as EbookCardData['coverTheme']) || 'violet',
            coverImageUrl: (e.coverImageUrl as string | undefined) || undefined,
            readMinutes: typeof e.readMinutes === 'number' ? e.readMinutes : 5,
            status: e.status ? String(e.status) : undefined,
            pageCount: typeof e.pageCount === 'number' ? e.pageCount : undefined,
            id: e.id ? String(e.id) : undefined,
          })),
        ),
      )
      .catch(() => { setEbooks([]); setEbooksError(true) })
      .finally(() => setLoadingEbooks(false))
  }, [gate.ready, reloadKey])

  if (!gate.ready) {
    return (
      <div className="w-full space-y-10">
        <SkeletonText lines={2} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-8">
      <div className="relative isolate">
        <SoftGlow className="-inset-x-2 -top-4 rounded-3xl" />
        <PageHeader
          illustration="courses"
          className="mb-0"
          icon={<Library aria-hidden />}
          title={t('learning.exploreResources')}
          description={t('learning.pocketEbooksAndCareerEssentialsOriginal2d7')}
        />
      </div>

      <Section title={t('learning.ebooks')} description={t('learning.flipThroughPocketGuidesTapAaa6')}>
        {loadingEbooks ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />{' '}{t('learning.loadingEbooks')}</div>
        ) : ebooksError ? (
          <EmptyState
            illustration="error"
            title={t('learning.couldntLoadEbooks')}
            description={t('learning.checkYourConnectionAndTryAgain')}
            actionLabel={t('common.tryAgain')}
            onAction={() => setReloadKey((k) => k + 1)}
          />
        ) : ebooks.length === 0 ? (
          <EmptyState illustration="courses"
            variant="default"
            title={t('learning.noPublishedEbooksYet')}
            description={t('learning.newPocketGuidesWillShowUpe72')}
            actionLabel={t('learning.browseDocs')}
            actionHref="/docs"
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {ebooks.map((e) => (
              <EbookCoverCard key={e.slug} ebook={e} />
            ))}
          </div>
        )}
      </Section>

      <Section title={t('learning.moreResources')}>
        <BentoGrid className="lg:grid-cols-3">
          {LINK_RESOURCES(t).map((r) => {
            const Icon = r.icon
            return (
              <Link key={r.href} href={r.href}>
                <Panel interactive className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <Badge variant="secondary">{r.tag}</Badge>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{r.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                  </div>
                  <p className="mt-auto text-xs tabular-nums text-muted-foreground">~{r.minutes} min</p>
                </Panel>
              </Link>
            )
          })}
        </BentoGrid>
      </Section>
    </div>
  )
}

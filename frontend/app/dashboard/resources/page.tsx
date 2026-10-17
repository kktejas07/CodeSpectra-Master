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

const LINK_RESOURCES = [
  {
    title: 'Platform documentation',
    description: 'Getting started, product overview, API, and user guides.',
    href: '/docs',
    tag: 'Docs',
    icon: BookOpen,
    minutes: 10,
  },
  {
    title: 'User handbook',
    description: 'Day-to-day workflows inside the dashboard.',
    href: '/docs/user/dashboard-guide',
    tag: 'Guide',
    icon: GraduationCap,
    minutes: 12,
  },
  {
    title: 'Resume builder',
    description: 'Craft a standout resume in minutes.',
    href: '/dashboard/resumes',
    tag: 'Tool',
    icon: FileText,
    minutes: 8,
  },
  {
    title: 'Security & privacy',
    description: 'How CodeSpectra protects assessments and personal data.',
    href: '/security',
    tag: 'Policy',
    icon: Shield,
    minutes: 6,
  },
  {
    title: 'Newsroom / articles',
    description: 'Long-form updates and career Signals.',
    href: '/dashboard/articles',
    tag: 'Editorial',
    icon: Library,
    minutes: 5,
  },
]

export default function ResourcesPage() {
  const gate = usePageGuard('user')
  const [ebooks, setEbooks] = useState<EbookCardData[]>([])
  const [loadingEbooks, setLoadingEbooks] = useState(true)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/resources/ebooks', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
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
      .catch(() => setEbooks([]))
      .finally(() => setLoadingEbooks(false))
  }, [gate.ready])

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
          className="mb-0"
          icon={<Library aria-hidden />}
          title="Explore resources"
          description="Pocket ebooks and career essentials — original CodeSpectra guides you can flip through."
        />
      </div>

      <Section title="Ebooks" description="Flip-through pocket guides. Tap a cover to start reading.">
        {loadingEbooks ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading ebooks…
          </div>
        ) : ebooks.length === 0 ? (
          <EmptyState
            variant="default"
            title="No published ebooks yet"
            description="New pocket guides will show up here when published. Check back soon."
            actionLabel="Browse docs"
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

      <Section title="More resources">
        <BentoGrid className="lg:grid-cols-3">
          {LINK_RESOURCES.map((r) => {
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

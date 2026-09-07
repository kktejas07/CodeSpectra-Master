'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, FileText, GraduationCap, Library, Loader2, Shield } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
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
    href: '/docs/user-handbook',
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
    title: 'Newsroom / Articles',
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
    <div className="w-full space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Explore Resources</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pocket ebooks and career essentials — original CodeSpectra guides you can flip through.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Ebooks</h2>
          <p className="text-sm text-muted-foreground">Unstop-style flipbooks. Tap a cover to read.</p>
        </div>
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
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">More resources</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LINK_RESOURCES.map((r) => {
            const Icon = r.icon
            return (
              <Link key={r.href} href={r.href}>
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <Badge variant="secondary">{r.tag}</Badge>
                  </div>
                  <div>
                    <p className="font-medium">{r.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                  </div>
                  <p className="mt-auto text-xs text-muted-foreground">~{r.minutes} min</p>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}

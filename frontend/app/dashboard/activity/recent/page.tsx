'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bookmark, Loader2, Video } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function RecentlyViewedPage() {
  const gate = usePageGuard('user')
  const [items, setItems] = useState<
    Array<{ type: string; id: string; title: string; href: string; viewedAt: string }>
  >([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/user/recently-viewed', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [gate.ready])

  if (!gate.ready || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Recently Viewed</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick up where you left off.</p>
      </div>
      {items.length === 0 ? (
        <EmptyState
          variant="default"
          title="Nothing viewed yet"
          description="Open a course or problem and it will show up here automatically."
          actionLabel="Browse courses"
          actionHref="/dashboard/courses"
        />
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={`${it.type}-${it.id}`}>
              <Link href={it.href}>
                <Card className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{it.title}</p>
                    <p className="text-xs capitalize text-muted-foreground">{it.type}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {it.viewedAt ? new Date(it.viewedAt).toLocaleString() : ''}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/dashboard/activity/sessions" className="inline-flex items-center gap-1 text-primary hover:underline">
          <Video className="h-3.5 w-3.5" /> My Sessions
        </Link>
        <Link href="/dashboard/activity/bookmarks" className="inline-flex items-center gap-1 text-primary hover:underline">
          <Bookmark className="h-3.5 w-3.5" /> Bookmarked Questions
        </Link>
      </div>
    </div>
  )
}

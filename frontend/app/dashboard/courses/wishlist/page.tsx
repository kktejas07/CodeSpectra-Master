'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, Loader2, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, Panel, BentoGrid } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'

type CourseCard = {
  id: string
  title: string
  description?: string
  category?: string
  level?: string
  image?: string
  sessions?: number
  enrolled?: number
}

export default function CourseWishlistPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<CourseCard[]>([])
  const [ids, setIds] = useState<string[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const [wishRes, coursesRes] = await Promise.all([
        fetch('/api/user/course-wishlist', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/courses', { credentials: 'include' }).then(r => r.json()),
      ])
      const wishIds: string[] = Array.isArray(wishRes?.data) ? wishRes.data.map(String) : []
      setIds(wishIds)
      const all: CourseCard[] = Array.isArray(coursesRes?.data) ? coursesRes.data : []
      const want = new Set(wishIds)
      setCourses(all.filter(c => want.has(String(c.id))))
    } catch {
      setCourses([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (gate.ready) void load()
  }, [gate.ready])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready && !loading) {
      const wishlistTour: TourStep[] = [
        {
          target: '[data-tour="wishlist-header"]',
          title: 'Saved courses watchlist',
          description: 'This page stores courses you hearted so you can enroll later when ready.',
          position: 'bottom',
        },
        {
          target: '[data-tour="wishlist-browse"]',
          title: 'Browse full course catalog',
          description: 'Browse the course catalog to discover new courses worth saving.',
          position: 'bottom',
        },
        {
          target: '[data-tour="wishlist-list"]',
          title: 'Open or remove saved',
          description: 'Tip: open a saved course to enroll, or tap the heart to remove it.',
          position: 'top',
        },
      ]
      autoPlayPageTour('wishlist', wishlistTour)}
  }, [gate.ready, loading, startTour, setTourSeen])

  const remove = async (courseId: string) => {
    setCourses(prev => prev.filter(c => c.id !== courseId))
    setIds(prev => prev.filter(id => id !== courseId))
    try {
      await csrfFetch('/api/user/course-wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })
    } catch {
      void load()
    }
  }

  if (!gate.ready || loading) {
    return (
      <div className="space-y-6 py-10">
        <SkeletonText lines={2} />
        <SkeletonList count={4} />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div data-tour="wishlist-header">
        <PageHeader
          title="Wishlist"
          description={<>Courses you saved for later · <span className="tabular-nums">{ids.length}</span> saved</>}
          icon={<Heart />}
          className="mb-0"
          actions={
            <Button variant="outline" asChild data-tour="wishlist-browse">
              <Link href="/dashboard/courses">Browse courses</Link>
            </Button>
          }
        />
      </div>

      <div data-tour="wishlist-list">
      {courses.length === 0 ? (
        <Panel className="p-4">
          <EmptyState
            variant="courses"
            title="Your wishlist is empty"
            description="Tap the heart on any course to save it here for later."
            actionLabel="Explore courses"
            actionHref="/dashboard/courses"
          />
        </Panel>
      ) : (
        <BentoGrid className="lg:grid-cols-3">
          {courses.map(c => (
            <Panel key={c.id} className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {c.category && <Badge variant="secondary" className="text-[11px] capitalize">{c.category}</Badge>}
                    {c.level && <Badge variant="outline" className="text-[10px] capitalize">{c.level}</Badge>}
                  </div>
                  <h2 className="text-lg font-semibold text-foreground truncate">{c.title}</h2>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.description}</p>
                </div>
                <button
                  type="button"
                  aria-label="Remove from wishlist"
                  onClick={() => remove(c.id)}
                  className="h-10 w-10 rounded-full border border-red-500/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 transition-colors hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Heart className="h-4 w-4 fill-red-500" />
                </button>
              </div>
              <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/60">
                <span>{c.sessions != null ? `${c.sessions} sessions` : '—'}</span>
                <Link href={`/dashboard/courses/${c.id}`} className="text-primary font-medium inline-flex items-center gap-1 hover:underline">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Panel>
          ))}
        </BentoGrid>
      )}
      </div>
    </div>
  )
}

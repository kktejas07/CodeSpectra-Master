'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, type TourStep } from '@/components/tour/tour-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

type Course = {
  id: string
  title: string
  description?: string
  category?: string
  level?: string
  enrolledAt?: string | null
}

export default function MyCoursesPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/user/my-courses', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setCourses(d.courses || []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false))
  }, [gate.ready])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready && !loading && !localStorage.getItem('has_seen_my-courses_tour')) {
      const myCoursesTour: TourStep[] = [
        {
          target: '[data-tour="my-courses-header"]',
          title: 'Your enrolled courses',
          description: 'Every course you enroll in shows up here for quick access.',
          position: 'bottom',
        },
        {
          target: '[data-tour="my-courses-actions"]',
          title: 'Browse or revisit',
          description: 'Explore the catalog or revisit courses on your watchlist.',
          position: 'bottom',
        },
        {
          target: '[data-tour="my-courses-list"]',
          title: 'Continue learning',
          description: 'Click any course card to pick up exactly where you left off.',
          position: 'top',
        },
      ]
      startTour(myCoursesTour, 'my-courses')
      setTourSeen('my-courses')
    }
  }, [gate.ready, loading, startTour, setTourSeen])

  if (!gate.ready || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading your courses…
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3" data-tour="my-courses-header">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">Courses you are enrolled in.</p>
        </div>
        <div className="flex gap-2" data-tour="my-courses-actions">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/courses/wishlist">
              <Heart className="mr-1.5 h-4 w-4" /> Watchlist
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/courses">Browse all</Link>
          </Button>
        </div>
      </div>

      <div data-tour="my-courses-list">
      {courses.length === 0 ? (
        <EmptyState
          variant="courses"
          title="No enrollments yet"
          description="Enroll from the Courses catalog to see them here. Leave a course and this empty state returns."
          actionLabel="Explore courses"
          actionHref="/dashboard/courses"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {courses.map((c) => (
            <Link key={c.id} href={`/dashboard/courses/${c.id}`}>
              <Card className="h-full p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
                <p className="font-semibold">{c.title}</p>
                {c.category || c.level ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[c.category, c.level].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
                {c.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}

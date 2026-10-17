'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Heart, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader, Panel, BentoGrid } from '@/components/app/page-kit'
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
    if (gate.ready && !loading) {
      const myCoursesTour: TourStep[] = [
        {
          target: '[data-tour="my-courses-header"]',
          title: 'Your enrolled courses hub',
          description: 'This page collects every course you enrolled in so you can resume learning quickly.',
          position: 'bottom',
        },
        {
          target: '[data-tour="my-courses-actions"]',
          title: 'Open watchlist or catalog',
          description: 'Visit your watchlist or browse the full catalog to find courses to start.',
          position: 'bottom',
        },
        {
          target: '[data-tour="my-courses-list"]',
          title: 'Resume any course here',
          description: 'Tip: click any course card to open its detail page and continue lessons.',
          position: 'top',
        },
      ]
      autoPlayPageTour('my-courses', myCoursesTour)}
  }, [gate.ready, loading, startTour, setTourSeen])

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
      <div data-tour="my-courses-header">
        <PageHeader
          illustration="courses"
          title="My courses"
          description="Courses you're enrolled in. Pick one to carry on where you left off."
          icon={<BookOpen />}
          className="mb-0"
          actions={
            <div className="flex gap-2" data-tour="my-courses-actions">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/courses/wishlist">
                  <Heart className="mr-1.5 h-4 w-4" /> Wishlist
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/courses">Browse all</Link>
              </Button>
            </div>
          }
        />
      </div>

      <div data-tour="my-courses-list">
      {courses.length === 0 ? (
        <Panel className="p-4">
          <EmptyState
            variant="courses"
            title="No courses yet"
            description="Enroll in a course from the catalogue and it will show up here."
            actionLabel="Explore courses"
            actionHref="/dashboard/courses"
          />
        </Panel>
      ) : (
        <BentoGrid className="lg:grid-cols-3">
          {courses.map((c) => (
            <Link key={c.id} href={`/dashboard/courses/${c.id}`} className="rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <Panel interactive className="h-full p-5">
                <p className="font-semibold text-foreground">{c.title}</p>
                {c.category || c.level ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[c.category, c.level].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
                {c.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                ) : null}
              </Panel>
            </Link>
          ))}
        </BentoGrid>
      )}
      </div>
    </div>
  )
}

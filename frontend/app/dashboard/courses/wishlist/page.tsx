'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, Loader2, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, type TourStep } from '@/components/tour/tour-context'
import { csrfFetch } from '@/lib/csrf-fetch'
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
    if (gate.ready && !loading && !localStorage.getItem('has_seen_wishlist_tour')) {
      const wishlistTour: TourStep[] = [
        {
          target: '[data-tour="wishlist-header"]',
          title: 'Your saved courses',
          description: 'Courses you tap the heart on are saved here for later.',
          position: 'bottom',
        },
        {
          target: '[data-tour="wishlist-browse"]',
          title: 'Find more courses',
          description: 'Browse the catalog to discover courses worth saving.',
          position: 'bottom',
        },
        {
          target: '[data-tour="wishlist-list"]',
          title: 'Open or remove',
          description: 'Open a saved course to start learning, or remove it anytime.',
          position: 'top',
        },
      ]
      startTour(wishlistTour, 'wishlist')
      setTourSeen('wishlist')
    }
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
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between gap-4" data-tour="wishlist-header">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="h-6 w-6 text-red-500 fill-red-500" /> Watchlist
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Courses you saved for later · {ids.length} saved
          </p>
        </div>
        <Button variant="outline" asChild data-tour="wishlist-browse">
          <Link href="/dashboard/courses">Browse courses</Link>
        </Button>
      </div>

      <div data-tour="wishlist-list">
      {courses.length === 0 ? (
        <EmptyState
          variant="courses"
          title="Your wishlist is empty"
          description="Tap the heart on a course to save it here. Remove the last one and this empty state comes back."
          actionLabel="Explore courses"
          actionHref="/dashboard/courses"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {courses.map(c => (
            <Card key={c.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {c.category && <Badge variant="secondary" className="text-[10px] uppercase">{c.category}</Badge>}
                    {c.level && <Badge variant="outline" className="text-[10px] capitalize">{c.level}</Badge>}
                  </div>
                  <h2 className="font-semibold truncate">{c.title}</h2>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.description}</p>
                </div>
                <button
                  type="button"
                  aria-label="Remove from wishlist"
                  onClick={() => remove(c.id)}
                  className="h-9 w-9 rounded-full border border-red-500/40 text-red-500 flex items-center justify-center shrink-0"
                >
                  <Heart className="h-4 w-4 fill-red-500" />
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                <span>{c.sessions != null ? `${c.sessions} sessions` : '—'}</span>
                <Link href={`/dashboard/courses/${c.id}`} className="text-primary font-medium inline-flex items-center gap-1 hover:underline">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}

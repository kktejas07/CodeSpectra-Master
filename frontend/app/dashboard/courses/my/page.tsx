'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, BookOpen, CheckCircle2, Heart, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader, Panel, BentoGrid } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useT } from '@/lib/i18n/client'

type Course = {
  id: string
  title: string
  description?: string
  category?: string
  level?: string
  enrolledAt?: string | null
  /** Server-verified progress (lesson_completions + graded quiz_results). */
  progressPercent?: number
  lessonsDone?: number
  totalLessons?: number
  quizzesPassed?: number
  quizzesTotal?: number
  completed?: boolean
}

export default function MyCoursesPage() {
  const { t } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const addToast = useToast()

  // Issue (or fetch the existing) certificate, then open its public verify page.
  const getCertificate = async (courseId: string) => {
    setClaimingId(courseId)
    try {
      const res = await csrfFetch(`/api/user/courses/${encodeURIComponent(courseId)}/certificate`, { method: 'POST' })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.certificate?.verifyUrl) throw new Error(j?.error || t('learning.couldNotGetYourCertificate'))
      window.location.assign(j.certificate.verifyUrl)
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : t('learning.couldNotGetYourCertificate') })
      setClaimingId(null)
    }
  }

  useEffect(() => {
    if (!gate.ready) return
    setLoading(true)
    setLoadError(false)
    fetch('/api/user/my-courses', { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((d) => setCourses(d.courses || []))
      .catch(() => { setCourses([]); setLoadError(true) })
      .finally(() => setLoading(false))
  }, [gate.ready, reloadKey])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready && !loading) {
      const myCoursesTour: TourStep[] = [
        {
          target: '[data-tour="my-courses-header"]',
          title: t('learning.yourEnrolledCoursesHub'),
          description: t('learning.thisPageCollectsEveryCourseYou131'),
          position: 'bottom',
        },
        {
          target: '[data-tour="my-courses-actions"]',
          title: t('learning.openWatchlistOrCatalog'),
          description: t('learning.visitYourWatchlistOrBrowseThe6bf'),
          position: 'bottom',
        },
        {
          target: '[data-tour="my-courses-list"]',
          title: t('learning.resumeAnyCourseHere'),
          description: t('learning.tipClickAnyCourseCardTo259'),
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
          title={t('learning.myCourses')}
          description={t('learning.coursesYoureEnrolledInPickOne653')}
          icon={<BookOpen />}
          className="mb-0"
          actions={
            <div className="flex gap-2" data-tour="my-courses-actions">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/courses/wishlist">
                  <Heart className="mr-1.5 h-4 w-4" />{' '}{t('learning.wishlist')}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/courses">{t('learning.browseAll')}</Link>
              </Button>
            </div>
          }
        />
      </div>

      <div data-tour="my-courses-list">
      {loadError ? (
        <Panel className="p-4">
          <EmptyState
            illustration="error"
            title={t('learning.couldntLoadYourCourses')}
            description={t('learning.checkYourConnectionAndTryAgain')}
            actionLabel={t('common.tryAgain')}
            onAction={() => setReloadKey((k) => k + 1)}
          />
        </Panel>
      ) : courses.length === 0 ? (
        <Panel className="p-4">
          <EmptyState
            variant="courses"
            title={t('learning.noCoursesYet')}
            description={t('learning.enrollInACourseFromThebea')}
            actionLabel={t('learning.exploreCourses')}
            actionHref="/dashboard/courses"
          />
        </Panel>
      ) : (
        <BentoGrid className="lg:grid-cols-3">
          {courses.map((c) => {
            const pct = Math.max(0, Math.min(100, Math.round(Number(c.progressPercent) || 0)))
            const total = Number(c.totalLessons) || 0
            const quizzes = Number(c.quizzesTotal) || 0
            return (
              <Panel key={c.id} className="flex h-full flex-col gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboard/courses/${c.id}`}
                      className="font-semibold text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
                    >
                      {c.title}
                    </Link>
                    {c.completed ? (
                      <Badge variant="outline" className="shrink-0 gap-1 border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" aria-hidden />{' '}{t('learning.completed')}</Badge>
                    ) : null}
                  </div>
                  {c.category || c.level ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[c.category, c.level].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {c.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                  ) : null}
                </div>

                <div className="mt-auto space-y-2">
                  {total > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{t('learning.progress')}</span>
                        <span className="font-medium tabular-nums text-foreground">{pct}%</span>
                      </div>
                      <Progress value={pct} aria-label={t('learning.titleProgress', { title: c.title })} />
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {Number(c.lessonsDone) || 0}/{total} lessons
                        {quizzes > 0 ? t('learning.valueQuizzesQuizzesPassed', { value: Number(c.quizzesPassed) || 0, quizzes }) : ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('learning.noLessonsPublishedYet')}</p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button asChild size="sm" variant={c.completed ? 'outline' : 'default'}>
                      <Link href={`/dashboard/courses/${c.id}`}>{c.completed ? t('learning.reviewCourse') : pct > 0 ? t('common.continue') : t('learning.start')}</Link>
                    </Button>
                    {c.completed ? (
                      <Button size="sm" className="gap-1.5" onClick={() => getCertificate(c.id)} disabled={claimingId === c.id}>
                        {claimingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Award className="h-4 w-4" aria-hidden />}{t('learning.getCertificate')}</Button>
                    ) : null}
                  </div>
                </div>
              </Panel>
            )
          })}
        </BentoGrid>
      )}
      </div>
    </div>
  )
}

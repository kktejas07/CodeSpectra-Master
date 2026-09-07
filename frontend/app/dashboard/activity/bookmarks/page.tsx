'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, type TourStep } from '@/components/tour/tour-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { csrfFetch } from '@/lib/csrf-fetch'
import { cn } from '@/lib/utils'
import { SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'

type ProblemItem = { problemId: string; slug: string; title: string; difficulty?: string | null }

type QuizItem = {
  id: string
  courseId: string
  courseTitle: string
  lessonId: string
  questionId: string
  question: string
  explanation: string
  href: string
}

type Tab = 'problems' | 'quizzes'

function BookmarksInner() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const search = useSearchParams()
  const router = useRouter()
  const tab: Tab = search.get('tab') === 'quizzes' ? 'quizzes' : 'problems'

  const [problems, setProblems] = useState<ProblemItem[]>([])
  const [quizzes, setQuizzes] = useState<QuizItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/user/problem-bookmarks', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/user/quiz-bookmarks', { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([p, q]) => {
        setProblems(p.items || [])
        setQuizzes(q.items || [])
      })
      .catch(() => {
        setProblems([])
        setQuizzes([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!gate.ready) return
    void load()
  }, [gate.ready])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready && !localStorage.getItem('has_seen_bookmarks_tour')) {
      const bookmarksTour: TourStep[] = [
        {
          target: '[data-tour="bookmarks-header"]',
          title: 'Saved for later',
          description: 'Problems and quiz questions you bookmark live here.',
          position: 'bottom',
        },
        {
          target: '[data-tour="bookmarks-tabs"]',
          title: 'Switch collections',
          description: 'Toggle between bookmarked problems and module-quiz questions.',
          position: 'bottom',
        },
        {
          target: '[data-tour="bookmarks-list"]',
          title: 'Revisit and remove',
          description: 'Click any entry to jump back in, or remove it when done.',
          position: 'top',
        },
      ]
      startTour(bookmarksTour, 'bookmarks')
      setTourSeen('bookmarks')
    }
  }, [gate.ready, startTour, setTourSeen])

  async function removeProblem(problemId: string, slug: string, title: string) {
    await csrfFetch('/api/user/problem-bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problemId, slug, title }),
    })
    setProblems((prev) => prev.filter((i) => i.problemId !== problemId))
  }

  async function removeQuiz(it: QuizItem) {
    await csrfFetch('/api/user/quiz-bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId: it.courseId,
        lessonId: it.lessonId,
        questionId: it.questionId,
        question: it.question,
      }),
    })
    setQuizzes((prev) => prev.filter((x) => x.id !== it.id))
  }

  function setTab(next: Tab) {
    const q = next === 'quizzes' ? '?tab=quizzes' : ''
    router.replace(`/dashboard/activity/bookmarks${q}`)
  }

  if (!gate.ready || loading) {
    return (
      <div className="w-full space-y-6">
        <SkeletonText lines={2} />
        <SkeletonList count={5} />
      </div>
    )
  }

  const emptyProblems = problems.length === 0
  const emptyQuizzes = quizzes.length === 0

  return (
    <div className="w-full space-y-6">
      <div data-tour="bookmarks-header">
        <h1 className="text-3xl font-bold tracking-tight">Bookmarked Questions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Problems and module-quiz questions you saved for later.
        </p>
      </div>

      <div className="flex w-fit gap-1 rounded-lg border border-border/60 bg-muted/30 p-1" data-tour="bookmarks-tabs">
        <button
          type="button"
          onClick={() => setTab('problems')}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'problems' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Problems ({problems.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('quizzes')}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            tab === 'quizzes' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Module quizzes ({quizzes.length})
        </button>
      </div>

      <div data-tour="bookmarks-list">
      {tab === 'problems' ? (
        emptyProblems ? (
          <EmptyState
            variant="bookmarks"
            title="No bookmarked questions available"
            description="Save problems while you practice — they will show up here. Remove one and this empty state returns automatically."
            actionLabel="Browse problems"
            actionHref="/dashboard/problems"
          />
        ) : (
          <ul className="space-y-2">
            {problems.map((it) => (
              <li key={it.problemId}>
                <Card className="flex items-center justify-between gap-3 p-3">
                  <Link href={`/dashboard/problems/${it.slug}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate font-medium">{it.title}</p>
                    {it.difficulty ? (
                      <p className="text-xs capitalize text-muted-foreground">{it.difficulty}</p>
                    ) : null}
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void removeProblem(it.problemId, it.slug, it.title)}
                  >
                    Remove
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : emptyQuizzes ? (
        <EmptyState
          variant="bookmarks"
          title="No bookmarked quiz questions available"
          description="Open a course module quiz and tap the bookmark icon on any question. Clear them later and this view returns."
          actionLabel="Browse courses"
          actionHref="/dashboard/courses"
        />
      ) : (
        <ul className="space-y-2">
          {quizzes.map((it) => (
            <li key={it.id}>
              <Card className="flex items-start justify-between gap-3 p-3">
                <Link href={it.href} className="min-w-0 flex-1 space-y-1 hover:underline">
                  <p className="font-medium leading-snug">{it.question}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.courseTitle || 'Course'} · module quiz
                  </p>
                </Link>
                <Button type="button" size="sm" variant="ghost" onClick={() => void removeQuiz(it)}>
                  Remove
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  )
}

export default function BookmarkedQuestionsPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full space-y-6">
          <SkeletonText lines={2} />
          <SkeletonList count={5} />
        </div>
      }
    >
      <BookmarksInner />
    </Suspense>
  )
}

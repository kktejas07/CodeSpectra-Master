'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2, Bookmark } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/app/page-kit'
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
  const addToast = useToast()
  const { startTour, setTourSeen } = useTour()
  const search = useSearchParams()
  const router = useRouter()
  const tab: Tab = search.get('tab') === 'quizzes' ? 'quizzes' : 'problems'

  const [problems, setProblems] = useState<ProblemItem[]>([])
  const [quizzes, setQuizzes] = useState<QuizItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = () => {
    setLoading(true)
    setLoadError(false)
    const getJson = (url: string) =>
      fetch(url, { credentials: 'include' }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
    Promise.all([
      getJson('/api/user/problem-bookmarks'),
      getJson('/api/user/quiz-bookmarks'),
    ])
      .then(([p, q]) => {
        setProblems(p.items || [])
        setQuizzes(q.items || [])
      })
      .catch(() => {
        setProblems([])
        setQuizzes([])
        setLoadError(true)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!gate.ready) return
    void load()
  }, [gate.ready])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const bookmarksTour: TourStep[] = [
        {
          target: '[data-tour="bookmarks-header"]',
          title: 'Your saved questions',
          description: 'This page collects problems and quiz questions you saved for later review.',
          position: 'bottom',
        },
        {
          target: '[data-tour="bookmarks-tabs"]',
          title: 'Switch saved collections',
          description: 'Toggle between Problems and Module quizzes to find saved items faster.',
          position: 'bottom',
        },
        {
          target: '[data-tour="bookmarks-list"]',
          title: 'Reopen or remove saves',
          description: 'Click an entry to jump back in or press Remove; empty lists point to problems or courses next.',
          position: 'top',
        },
      ]
      autoPlayPageTour('bookmarks', bookmarksTour)}
  }, [gate.ready, startTour, setTourSeen])

  async function removeProblem(problemId: string, slug: string, title: string) {
    try {
      const res = await csrfFetch('/api/user/problem-bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId, slug, title }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setProblems((prev) => prev.filter((i) => i.problemId !== problemId))
      addToast({ type: 'success', title: 'Bookmark removed' })
    } catch {
      addToast({ type: 'error', title: 'Couldn’t remove the bookmark', message: 'Please try again.' })
    }
  }

  async function removeQuiz(it: QuizItem) {
    try {
      const res = await csrfFetch('/api/user/quiz-bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: it.courseId,
          lessonId: it.lessonId,
          questionId: it.questionId,
          question: it.question,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setQuizzes((prev) => prev.filter((x) => x.id !== it.id))
      addToast({ type: 'success', title: 'Bookmark removed' })
    } catch {
      addToast({ type: 'error', title: 'Couldn’t remove the bookmark', message: 'Please try again.' })
    }
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
        <PageHeader
          illustration="bookmarks"
          className="mb-0"
          icon={<Bookmark aria-hidden />}
          title="Bookmarked questions"
          description="Problems and module-quiz questions you saved for later."
        />
      </div>

      <div className="flex w-fit gap-1 rounded-xl border border-border/70 bg-muted/30 p-1" data-tour="bookmarks-tabs">
        <button
          type="button"
          onClick={() => setTab('problems')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium tabular-nums transition-colors',
            tab === 'problems' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Problems ({problems.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('quizzes')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium tabular-nums transition-colors',
            tab === 'quizzes' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Module quizzes ({quizzes.length})
        </button>
      </div>

      <div data-tour="bookmarks-list">
      {loadError ? (
        <EmptyState
          illustration="error"
          title="Couldn't load your bookmarks"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={load}
        />
      ) : tab === 'problems' ? (
        emptyProblems ? (
          <EmptyState
            variant="bookmarks"
            title="No bookmarked problems yet"
            description="Bookmark problems while you practice and they will show up here."
            actionLabel="Browse problems"
            actionHref="/dashboard/problems"
          />
        ) : (
          <ul className="space-y-2">
            {problems.map((it) => (
              <li key={it.problemId}>
                <Card className="flex items-center justify-between gap-3 rounded-2xl border-border/70 p-3 transition-colors duration-200 hover:border-primary/30">
                  <Link href={`/dashboard/problems/${it.slug}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate font-medium text-foreground">{it.title}</p>
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
          title="No bookmarked quiz questions yet"
          description="Open a course module quiz and tap the bookmark icon on any question to save it here."
          actionLabel="Browse courses"
          actionHref="/dashboard/courses"
        />
      ) : (
        <ul className="space-y-2">
          {quizzes.map((it) => (
            <li key={it.id}>
              <Card className="flex items-start justify-between gap-3 rounded-2xl border-border/70 p-3 transition-colors duration-200 hover:border-primary/30">
                <Link href={it.href} className="min-w-0 flex-1 space-y-1 hover:underline">
                  <p className="font-medium leading-snug text-foreground">{it.question}</p>
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

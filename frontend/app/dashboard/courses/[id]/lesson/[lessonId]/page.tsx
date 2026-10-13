'use client'

import { useEffect, useState, use, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { 
  ArrowLeft, CheckCircle, Play, Lock, Loader2, 
  Menu, X, ChevronDown, ChevronUp, BookOpen, Puzzle 
} from 'lucide-react'
import { SkeletonCard, SkeletonList, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { cn } from '@/lib/utils'
import { useToast } from '@/lib/toast-context'
import { VideoPlayer } from '@/components/ui/video-player'
import { csrfFetch } from '@/lib/csrf-fetch'
import { resumeSeconds, shouldAutoComplete } from '@/lib/courses/watch-progress'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { QuizComponent, type QuizQuestion } from '@/components/courses/QuizComponent'
import { quizLessonId, parseQuizLessonId, fallbackModuleQuiz } from '@/lib/courses/module-quiz'
import { stripEmbeddedQuizzes, stripQuizSlides } from '@/lib/courses/strip-embedded-quizzes'

interface Resource {
  title?: string
  url?: string
  embed_url?: string
  provider?: string
  duration?: number
}

interface Lesson {
  id: string
  title: string
  slug: string
  description?: string
  url?: string
  duration?: number
  resources?: Resource[]
  free?: boolean
  type?: 'video' | 'text'
  videoType?: 'youtube' | 'ai'
  script?: any[]
  audioUrl?: string
  videoUrl?: string
  captionsUrl?: string
  textContent?: string
  chapters?: { title?: string; startSec?: number }[]
  takeaways?: string[]
  quickCheck?: { recall?: string; apply?: string; stretch?: string }
  nextTeaser?: string
}

interface Section {
  title: string
  slug: string
  lessons: Lesson[]
  quiz?: QuizQuestion[]
}

interface Course {
  id: string
  title: string
  sections?: Section[]
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ponytail: live render status replaces the dead "MP4 not generated yet" box.
// Queries the admin jobs endpoint scoped by ?courseId (readable by any
// authenticated user); degrades to a generic pending note when unreadable.
function LessonVideoStatus({ courseId, onRetryHint }: { courseId: string; onRetryHint?: string }) {
  const [state, setState] = useState<{ loading: boolean; jobs: any[]; unreadable: boolean }>({
    loading: true, jobs: [], unreadable: false,
  })
  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/courses/jobs?courseId=${encodeURIComponent(courseId)}`, { credentials: 'include' })
      .then(async r => {
        if (cancelled) return
        if (!r.ok) { setState({ loading: false, jobs: [], unreadable: true }); return }
        const data = await r.json().catch(() => ({}))
        setState({ loading: false, jobs: Array.isArray(data.jobs) ? data.jobs : [], unreadable: false })
      })
      .catch(() => { if (!cancelled) setState({ loading: false, jobs: [], unreadable: true }) })
    return () => { cancelled = true }
  }, [courseId])

  const box = (children: React.ReactNode) => (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-6 bg-black text-muted-foreground">
      <Play className="h-10 w-10 opacity-40" />
      {children}
    </div>
  )
  if (state.loading) {
    return box(<p className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking video status…</p>)
  }
  if (state.unreadable) {
    return box(<p className="text-sm">MP4 not generated yet — the video may still be rendering. Check back soon.</p>)
  }
  const job = state.jobs[0]
  if (!job) {
    return box(<p className="text-sm">MP4 not generated yet. Ask an admin to generate videos from Course Generator.</p>)
  }
  const done = Number(job.completedItems || 0)
  const total = Number(job.totalItems || 0)
  const status = String(job.status || '')
  if (status === 'failed' || Number(job.failedItems || 0) > 0) {
    return box(<>
      <p className="text-sm text-red-400 font-medium">Video generation failed{(job.error || '') ? `: ${String(job.error).slice(0, 160)}` : total ? ` — ${done}/${total} lessons rendered` : ''}</p>
      <p className="text-xs opacity-70">Ask an admin to retry from Course Generator{onRetryHint ? ` (${onRetryHint})` : ''}.</p>
    </>)
  }
  if (status === 'completed') {
    return box(<>
      <p className="text-sm">Render finished but this lesson has no video — it may have failed individually.</p>
      <p className="text-xs opacity-70">Ask an admin to retry from Course Generator.</p>
    </>)
  }
  // pending | running
  const queuedMs = Date.now() - Date.parse(String(job.startedAt || '') || String(Date.now()))
  if (status === 'pending' && Number.isFinite(queuedMs) && queuedMs > 10 * 60 * 1000) {
    return box(<>
      <p className="text-sm text-amber-400 font-medium">Worker may be offline — job queued {Math.round(queuedMs / 60000)} min ago with no progress.</p>
      <p className="text-xs opacity-70">Ask an admin to check the course worker, then retry from Course Generator.</p>
    </>)
  }
  if (status === 'running' && total > 0) {
    return box(<>
      <p className="text-sm">Video {Math.min(done + 1, total)} of {total} rendered…</p>
      <div className="w-48 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.round((done / total) * 100))}%` }} />
      </div>
      <p className="text-xs opacity-70">{done}/{total} lessons done — check back soon.</p>
    </>)
  }
  return box(<p className="text-sm">Video queued — waiting for the course worker… check back soon.</p>)
}

function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('/') && typeof window !== 'undefined') return `${window.location.origin}${url}`
  return url
}

function scriptAsMarkdown(script: any[]): string {
  return stripQuizSlides(script).map((s: any) => {
    const bullets = Array.isArray(s.content) ? s.content : s.content ? [s.content] : []
    return `## ${s.title || 'Slide'}\n\n${bullets.map((b: string) => `- ${b}`).join('\n')}`
  }).join('\n\n')
}


// ponytail: one-course memory so lesson→lesson remounts skip the spinner; refetch if you open a different course
let lessonShellCache: {
  courseId: string
  course: Course
  completions: string[]
  positions: Record<string, number>
} | null = null

export default function LessonPlayerPage({ params }: { params: Promise<{ id: string, lessonId: string }> }) {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const router = useRouter()
  const resolved = use(params)
  const { id: courseId, lessonId } = resolved
  const cached = lessonShellCache?.courseId === courseId ? lessonShellCache : null

  const [course, setCourse] = useState<Course | null>(cached?.course ?? null)
  const [loading, setLoading] = useState(!cached)
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(() => new Set(cached?.completions ?? []))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['0']))
  const [viewMode, setViewMode] = useState<'video' | 'text'>('video')
  const [quizScores, setQuizScores] = useState<Record<number, number>>({})
  const [startAt, setStartAt] = useState(() => resumeSeconds(cached?.positions?.[lessonId]))
  const [seekNonce, setSeekNonce] = useState(0)
  const lastPos = useRef(0)
  const lastSave = useRef(0)
  const autoCompleted = useRef(cached?.completions.includes(lessonId) ?? false)
  const positionsRef = useRef<Record<string, number>>(cached?.positions ?? {})
  const lessonIdRef = useRef(lessonId)
  lessonIdRef.current = lessonId

  useEffect(() => {
    let cancelled = false
    if (lessonShellCache?.courseId !== courseId) setLoading(true)
    Promise.all([
      fetch(`/api/courses/${encodeURIComponent(courseId)}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/user/courses/${encodeURIComponent(courseId)}/completions`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch(`/api/user/courses/${encodeURIComponent(courseId)}/progress`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ]).then(([courseData, completionsData, progressData]) => {
      if (cancelled) return
      if (courseData.data) setCourse(courseData.data)
      const done: string[] = completionsData?.completedLessons || []
      setCompletedLessons(new Set(done))
      if (progressData?.quizScores) setQuizScores(progressData.quizScores)
      const positions = { ...positionsRef.current, ...(progressData?.lessonPositions || {}) }
      positionsRef.current = positions
      if (courseData.data) {
        lessonShellCache = { courseId, course: courseData.data, completions: done, positions }
      }
      const id = lessonIdRef.current
      autoCompleted.current = done.includes(id)
      setStartAt(resumeSeconds(positions[id]))
    }).catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    csrfFetch(`/api/user/courses/${encodeURIComponent(courseId)}/enroll`, { method: 'POST' }).catch(() => {})
    return () => { cancelled = true }
  }, [courseId])

  useEffect(() => {
    lastPos.current = 0
    lastSave.current = 0
    autoCompleted.current = completedLessons.has(lessonId)
    setStartAt(resumeSeconds(positionsRef.current[lessonId]))
    setViewMode('video')
  }, [lessonId])

  useEffect(() => {
    if (!course) return
    const sectionIdx = (course.sections || []).findIndex((s: Section) => s.lessons.some((l: Lesson) => l.id === lessonId))
    if (sectionIdx !== -1) setOpenSections(prev => prev.has(String(sectionIdx)) ? prev : new Set([...prev, String(sectionIdx)]))
  }, [lessonId, course])

  // Recently viewed — record lesson views so /dashboard/activity/recent
  // actually fills up (previously only course + problem pages recorded).
  useEffect(() => {
    if (!course) return
    const lesson = (course.sections || [])
      .flatMap((s: Section) => s.lessons)
      .find((l: Lesson) => l.id === lessonId)
    if (!lesson) return
    void csrfFetch('/api/user/recently-viewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'lesson',
        id: lessonId,
        title: lesson.title ? `${lesson.title} · ${course.title}` : course.title,
        href: `/dashboard/courses/${courseId}/lesson/${lessonId}`,
      }),
    }).catch(() => {})
  }, [course, courseId, lessonId])

  useEffect(() => {
    return () => {
      const t = lastPos.current
      if (t < 5) return
      csrfFetch(`/api/user/courses/${encodeURIComponent(courseId)}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, position: Math.floor(t) }),
      }).catch(() => {})
    }
  }, [courseId, lessonId])

  if (!course && (loading || !gate.ready)) {
    return (
      <div className="w-full h-screen flex flex-col bg-background">
        <div className="h-14 border-b border-border/40 bg-card shrink-0 flex items-center px-4 gap-4">
          <SkeletonText lines={1} />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 flex flex-col min-w-0 p-6 space-y-4">
            <SkeletonText lines={1} />
            <SkeletonCard />
          </main>
          <aside className="hidden lg:block w-80 border-l border-border/40 bg-card p-4">
            <SkeletonList count={4} />
          </aside>
        </div>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-background gap-4">
        <BookOpen className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">Course not found</h2>
        <Button onClick={() => router.push('/dashboard/courses')}>Back to Courses</Button>
      </div>
    )
  }

  const sections = course.sections || []
  let activeLesson: Lesson | null = null
  let nextLesson: Lesson | null = null
  let prevLesson: Lesson | null = null

  const quizSectionIndex = parseQuizLessonId(lessonId)
  const isQuizMode = quizSectionIndex != null
  const quizSection = isQuizMode ? sections[quizSectionIndex] : null
  const quizQuestions: QuizQuestion[] = quizSection
    ? (Array.isArray(quizSection.quiz) && quizSection.quiz.length
        ? quizSection.quiz as QuizQuestion[]
        : fallbackModuleQuiz(quizSection.title, quizSection.lessons, course.title) as QuizQuestion[])
    : []

  const allLessons = sections.flatMap(s => s.lessons)
  const activeIndex = allLessons.findIndex(l => l.id === lessonId)
  
  // Quiz "virtual lesson" navigation (Unstop-style module quiz after videos)
  let quizNextHref: string | null = null
  let quizPrevHref: string | null = null
  if (isQuizMode && quizSectionIndex != null) {
    const sec = sections[quizSectionIndex]
    const last = sec?.lessons?.[sec.lessons.length - 1]
    if (last) quizPrevHref = `/dashboard/courses/${courseId}/lesson/${last.id}`
    const nextSec = sections[quizSectionIndex + 1]
    if (nextSec?.lessons?.[0]) quizNextHref = `/dashboard/courses/${courseId}/lesson/${nextSec.lessons[0].id}`
  }

  if (activeIndex !== -1) {
    activeLesson = allLessons[activeIndex]
    if (activeIndex > 0) prevLesson = allLessons[activeIndex - 1]
    if (activeIndex < allLessons.length - 1) nextLesson = allLessons[activeIndex + 1]
    // If this is the last lesson in its section and a quiz exists (or can fallback), Next → quiz
    const sIdx = sections.findIndex(s => s.lessons.some(l => l.id === activeLesson?.id))
    if (sIdx >= 0) {
      const sec = sections[sIdx]
      const lastId = sec.lessons[sec.lessons.length - 1]?.id
      if (activeLesson?.id === lastId) {
        nextLesson = { id: quizLessonId(sIdx), title: "Let's test your understanding!", slug: quizLessonId(sIdx) } as Lesson
      }
    }
  }

  if (!activeLesson && !isQuizMode) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-background gap-4">
        <BookOpen className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">Lesson not found</h2>
        <Button onClick={() => router.push(`/dashboard/courses/${courseId}`)}>Back to Course</Button>
      </div>
    )
  }

  const lesson = activeLesson

  // ponytail: next-lesson URL feeds the player's autoplay-next overlay; undefined disables it.
  const nextLessonUrl = nextLesson ? `/dashboard/courses/${courseId}/lesson/${nextLesson.id}` : undefined
  const seekToTime = (sec: number) => { setStartAt(sec); setSeekNonce(n => n + 1) }


  const markComplete = (id: string) => {
    setCompletedLessons(prev => new Set([...prev, id]))
    csrfFetch(`/api/user/courses/${encodeURIComponent(courseId)}/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId: id }),
    }).catch(() => {})
    if (lessonShellCache?.courseId === courseId) {
      lessonShellCache = { ...lessonShellCache, completions: [...new Set([...lessonShellCache.completions, id])] }
    }
    addToast({ title: 'Lesson marked as complete!', type: 'success' })
  }

  const savePosition = (t: number, duration: number) => {
    lastPos.current = t
    const pos = Math.floor(t)
    positionsRef.current = { ...positionsRef.current, [lessonId]: pos }
    if (lessonShellCache?.courseId === courseId) lessonShellCache = { ...lessonShellCache, positions: positionsRef.current }
    const now = Date.now()
    if (now - lastSave.current >= 5000) {
      lastSave.current = now
      csrfFetch(`/api/user/courses/${encodeURIComponent(courseId)}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, position: pos }),
      }).catch(() => {})
    }
    if (!autoCompleted.current && shouldAutoComplete(t, duration)) {
      autoCompleted.current = true
      markComplete(lessonId)
    }
  }

  const toggleSection = (idx: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const isDone = !!(activeLesson && completedLessons.has(activeLesson.id))

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden text-foreground">
      {/* ── Top Navigation Bar ── */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border/40 bg-card shrink-0 shadow-sm z-20 relative">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/courses/${courseId}`} className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="hidden sm:block">
            <h1 className="font-semibold text-sm line-clamp-1">{course.title}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              <span>{isQuizMode ? (quizSection?.title || "Module quiz") : activeLesson?.title}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress / Mark Complete */}
          {isDone ? (
            <div className="hidden sm:flex items-center gap-2 text-emerald-500 font-medium text-sm px-3 py-1.5 bg-emerald-500/10 rounded-full">
              <CheckCircle className="h-4 w-4" /> Completed
            </div>
          ) : (
            <Button size="sm" variant="outline" className="hidden sm:flex h-8 text-xs font-medium" onClick={() => markComplete(activeLesson!.id)}>
              Mark as Complete
            </Button>
          )}

          {/* Toggle Sidebar on Mobile/Desktop */}
          <Button variant="ghost" size="icon" className="h-10 w-10 lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Main Video Area ── */}
        <main className="flex-1 flex flex-col min-w-0 bg-black/5 dark:bg-black/40">
          <div className="flex-1 p-0 sm:p-4 lg:p-6 overflow-y-auto">
            <div className="w-full space-y-6">
              
              {/* Content Header & Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold">{isQuizMode ? "Let's test your understanding!" : activeLesson?.title}</h2>
                </div>
                
                {(!isQuizMode && activeLesson && (activeLesson?.textContent || activeLesson?.script?.length)) && (
                  <div className="flex items-center p-1 bg-muted/50 rounded-lg border border-border/50 shrink-0 w-max">
                    <button
                      onClick={() => setViewMode('text')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                        viewMode === 'text' 
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border/50" 
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <BookOpen className="w-4 h-4" /> Text Lesson
                    </button>
                    <button
                      onClick={() => setViewMode('video')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                        viewMode === 'video' 
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border/50" 
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <Play className="w-4 h-4" /> Video Lesson
                    </button>
                  </div>
                )}
              </div>

              {/* Unstop-style module quiz */}
              {isQuizMode ? (
                <div className="mt-6 rounded-2xl border border-border/40 bg-card p-6 shadow-sm">
                  <div className="mb-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-primary">Module quiz</p>
                    <h2 className="text-2xl font-bold mt-1">Let&apos;s test your understanding!</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {quizSection?.title || 'This module'} — answer to unlock the next module.
                    </p>
                    {quizSectionIndex != null && quizScores[quizSectionIndex] != null && (
                      <p className="text-sm text-emerald-600 mt-2">Best score: {quizScores[quizSectionIndex]}%</p>
                    )}
                  </div>
                  {quizQuestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Quiz questions are not ready yet.</p>
                  ) : (
                    <QuizComponent
                      questions={quizQuestions}
                      bookmark={{
                        courseId,
                        courseTitle: course.title,
                        lessonId,
                        href: `/dashboard/courses/${courseId}/lesson/${lessonId}`,
                      }}
                      reviewHref={
                        quizSection?.lessons?.[0]?.id
                          ? `/dashboard/courses/${courseId}/lesson/${quizSection.lessons[0].id}`
                          : undefined
                      }
                      reviewLabel={
                        quizSection?.lessons?.[0]?.title
                          ? `Review lesson: ${quizSection.lessons[0].title}`
                          : 'Review module lessons'
                      }
                      onComplete={async (score, total) => {
                        const pct = Math.round((score / total) * 100)
                        if (quizSectionIndex == null) return
                        setQuizScores(prev => ({ ...prev, [quizSectionIndex]: pct }))
                        try {
                          await csrfFetch(`/api/user/courses/${encodeURIComponent(courseId)}/progress`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              quizScores: { ...quizScores, [quizSectionIndex]: pct },
                              ...(pct >= 80
                                ? { completedModules: Array.from(new Set([
                                    ...((await fetch(`/api/user/courses/${encodeURIComponent(courseId)}/progress`, { credentials: 'include' }).then(r => r.json()).catch(() => ({})))?.completedModules || []),
                                    quizSectionIndex,
                                  ])) }
                                : {}),
                            }),
                          })
                        } catch {}
                        if (pct >= 80) {
                          addToast({ title: `Passed! ${pct}% — module unlocked`, type: 'success' })
                          if (quizNextHref) setTimeout(() => router.push(quizNextHref), 800)
                        } else {
                          addToast({ title: `${pct}% — need 80% to pass. Review and retry.`, type: 'error' })
                        }
                      }}
                    />
                  )}
                  <div className="flex justify-between mt-6 pt-4 border-t border-border/40">
                    <Button variant="outline" disabled={!quizPrevHref} onClick={() => quizPrevHref && router.push(quizPrevHref)}>Previous</Button>
                    <Button disabled={!quizNextHref || (quizSectionIndex != null && (quizScores[quizSectionIndex] ?? 0) < 80)} onClick={() => quizNextHref && router.push(quizNextHref)}>
                      Next Module
                    </Button>
                  </div>
                </div>
              ) : (
              <>
              {/* Conditional Content Area */}
              <div className="mt-6">
                {viewMode === 'video' ? (
                  <div className="w-full aspect-video bg-black sm:rounded-2xl overflow-hidden shadow-2xl relative border border-border/20">
                    {activeLesson?.videoUrl ? (
                      <VideoPlayer
                        key={`${activeLesson?.id}-${seekNonce}`}
                        src={resolveMediaUrl(activeLesson?.videoUrl)}
                        title={activeLesson?.title}
                        className="w-full h-full border-0 rounded-none"
                        startAt={startAt}
                        captionsSrc={resolveMediaUrl(activeLesson?.captionsUrl)}
                        onProgress={savePosition}
                        onEnded={() => { if (!isDone) markComplete(activeLesson.id) }}
                        transcriptSlides={activeLesson?.script}
                        lessonDuration={activeLesson?.duration}
                        onSeekTime={seekToTime}
                        chapters={activeLesson?.chapters}
                        nextLessonUrl={nextLessonUrl}
                      />
                    ) : activeLesson?.url ? (
                      <VideoPlayer
                        key={`${activeLesson?.id}-${seekNonce}`}
                        src={activeLesson?.url}
                        title={activeLesson?.title}
                        className="w-full h-full"
                        startAt={startAt}
                        onProgress={savePosition}
                        onEnded={() => { if (!isDone) markComplete(activeLesson.id) }}
                        transcriptSlides={activeLesson?.script}
                        lessonDuration={activeLesson?.duration}
                        onSeekTime={seekToTime}
                        chapters={activeLesson?.chapters}
                        nextLessonUrl={nextLessonUrl}
                      />
                    ) : (
                      <LessonVideoStatus courseId={courseId} />
                    )}
                  </div>
                ) : (
                  <div className="prose prose-slate dark:prose-invert max-w-none prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 bg-card rounded-2xl p-8 border border-border/40 shadow-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {stripEmbeddedQuizzes(
                        activeLesson?.textContent
                          || (activeLesson?.script?.length ? scriptAsMarkdown(activeLesson?.script) : '')
                          || 'No text content available for this lesson.',
                      )}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Optional AI extras — written by a later pipeline track; nothing renders when absent */}
              {!isQuizMode && !!activeLesson && (
                ((activeLesson.chapters?.length || 0) > 0 || (activeLesson.takeaways?.length || 0) > 0 || !!activeLesson.quickCheck || (activeLesson.nextTeaser || '')) && (
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  {(activeLesson.chapters?.length || 0) > 0 && (
                    <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-sm">
                      <h3 className="text-sm font-semibold mb-3">Chapters</h3>
                      <ul className="space-y-1">
                        {(activeLesson.chapters || []).map((ch, i) => {
                          const sec = Number(ch?.startSec)
                          const seekable = Number.isFinite(sec) && sec >= 0 && !!(activeLesson.videoUrl || activeLesson.url)
                          return (
                            <li key={i}>
                              {seekable ? (
                                <button
                                  className="w-full flex items-center gap-3 text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
                                  onClick={() => { setStartAt(sec); setSeekNonce(n => n + 1) }}
                                >
                                  <span className="font-mono text-xs text-primary shrink-0">{formatDuration(sec)}</span>
                                  <span className="line-clamp-1">{(ch?.title || `Chapter ${i + 1}`).slice(0, 120)}</span>
                                </button>
                              ) : (
                                <div className="flex items-center gap-3 text-sm px-2 py-1.5">
                                  {Number.isFinite(sec) && sec >= 0 && (
                                    <span className="font-mono text-xs text-muted-foreground shrink-0">{formatDuration(sec)}</span>
                                  )}
                                  <span className="line-clamp-1">{((ch?.title || `Chapter ${i + 1}`) || '').slice(0, 120)}</span>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                  {(activeLesson.takeaways?.length || 0) > 0 && (
                    <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-sm">
                      <h3 className="text-sm font-semibold mb-3">Key takeaways</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {(activeLesson.takeaways || []).filter(Boolean).map((t, i) => (
                          <li key={i} className="flex gap-2"><CheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" /><span>{String(t).slice(0, 500)}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!activeLesson.quickCheck && (
                    !!((activeLesson.quickCheck.recall || '') || (activeLesson.quickCheck.apply || '') || (activeLesson.quickCheck.stretch || ''))) && (
                    <div className="rounded-2xl border border-border/40 bg-card p-5 shadow-sm lg:col-span-2">
                      <h3 className="text-sm font-semibold mb-3">Quick check</h3>
                      <div className="grid gap-3 sm:grid-cols-3 text-sm">
                        {(activeLesson.quickCheck.recall || '') && (
                          <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs font-medium uppercase tracking-wide text-primary mb-1">Recall</p><p className="text-muted-foreground">{String(activeLesson.quickCheck.recall).slice(0, 500)}</p></div>
                        )}
                        {(activeLesson.quickCheck.apply || '') && (
                          <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs font-medium uppercase tracking-wide text-primary mb-1">Apply</p><p className="text-muted-foreground">{String(activeLesson.quickCheck.apply).slice(0, 500)}</p></div>
                        )}
                        {(activeLesson.quickCheck.stretch || '') && (
                          <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs font-medium uppercase tracking-wide text-primary mb-1">Stretch</p><p className="text-muted-foreground">{String(activeLesson.quickCheck.stretch).slice(0, 500)}</p></div>
                        )}
                      </div>
                    </div>
                  )}
                  {(activeLesson.nextTeaser || '') && (
                    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm lg:col-span-2">
                      <div className="flex items-start gap-3">
                        <Play className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold mb-1">Up next{nextLesson?.title ? `: ${nextLesson.title}` : ''}</h3>
                          <p className="text-sm text-muted-foreground">{String(activeLesson.nextTeaser).slice(0, 500)}</p>
                          {nextLessonUrl && (
                            <Link href={nextLessonUrl} className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-primary hover:underline">
                              Continue to next lesson <span aria-hidden="true">→</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )
              )}

              </>
              )}

              {/* Lesson Details & Footer */}
              <div className="px-4 sm:px-0 space-y-6 pb-20 pt-8 mt-8 border-t border-border/40">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    {activeLesson?.description && (
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                        {activeLesson?.description}
                      </p>
                    )}
                  </div>
                  
                  {/* Prev/Next Navigation */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button 
                      variant="outline" 
                      disabled={!prevLesson}
                      onClick={() => router.push(`/dashboard/courses/${courseId}/lesson/${prevLesson?.id}`)}
                    >
                      Previous
                    </Button>
                    <Button 
                      disabled={!nextLesson}
                      onClick={() => {
                        if (!isDone) markComplete(activeLesson!.id)
                        router.push(`/dashboard/courses/${courseId}/lesson/${nextLesson?.id}`)
                      }}
                    >
                      {isDone ? 'Next Lesson' : 'Complete & Continue'}
                    </Button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </main>

        {/* ── Right Sidebar (Curriculum) ── */}
        <aside className={cn(
          "absolute lg:static top-0 right-0 h-full w-full max-w-[85vw] sm:w-80 lg:w-96 bg-card border-l border-border/40 shadow-2xl lg:shadow-none transition-transform duration-300 z-10 flex flex-col",
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}>
          <div className="px-5 py-4 border-b border-border/40 shrink-0 bg-muted/20 flex items-center justify-between">
            <h3 className="font-semibold">Course Content</h3>
            <span className="text-xs text-muted-foreground font-medium bg-background px-2 py-1 rounded-md border border-border/50">
              {completedLessons.size} / {allLessons.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sections.map((section, sIdx) => {
              const isOpen = openSections.has(String(sIdx))
              return (
                <div key={section.slug} className="border-b border-border/40 last:border-0">
                  <button
                    onClick={() => toggleSection(String(sIdx))}
                    className="w-full flex items-center justify-between px-5 py-3.5 bg-card hover:bg-muted/30 transition-colors text-left"
                  >
                    <div>
                      <p className="font-medium text-sm text-foreground/90 leading-tight">
                        Section {sIdx + 1}: {section.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {section.lessons.length} lessons
                      </p>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="bg-background divide-y divide-border/20">
                      {section.lessons.map((lesson, lIdx) => {
                        const isActive = lesson.id === activeLesson?.id
                        const isCompleted = completedLessons.has(lesson.id)
                        
                        return (
                          <button
                            key={lesson.id}
                            onClick={() => router.push(`/dashboard/courses/${courseId}/lesson/${lesson.id}`)}
                            className={cn(
                              "w-full flex items-start gap-3 px-5 py-3 text-left transition-colors relative group",
                              isActive ? "bg-primary/5" : "hover:bg-muted/40"
                            )}
                          >
                            {/* Active indicator bar */}
                            {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                            
                            <div className={cn(
                              "mt-0.5 shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                              isCompleted 
                                ? "bg-emerald-500 border-emerald-500 text-white" 
                                : isActive 
                                  ? "border-primary bg-primary/20 text-primary"
                                  : "border-muted-foreground/30 text-transparent"
                            )}>
                              {isCompleted && <CheckCircle className="h-3 w-3" />}
                              {!isCompleted && isActive && <Play className="h-2 w-2 fill-current" />}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-sm leading-snug line-clamp-2",
                                isActive ? "font-semibold text-primary" : "text-foreground/80 font-medium"
                              )}>
                                {lIdx + 1}. {lesson.title}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground font-medium">
                                <span className="flex items-center gap-1">
                                  {lesson.type === 'video' || lesson.videoType ? <Play className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
                                  {lesson.videoType === 'ai' ? 'AI Video' : lesson.type === 'video' ? 'Video' : 'Article'}
                                </span>
                                {lesson.duration && (
                                  <>
                                    <span className="w-1 h-1 rounded-full bg-border" />
                                    <span>{formatDuration(lesson.duration)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                      <button
                        onClick={() => router.push(`/dashboard/courses/${courseId}/lesson/${quizLessonId(sIdx)}`)}
                        className={cn(
                          "w-full flex items-start gap-3 px-5 py-3 text-left transition-colors relative",
                          isQuizMode && quizSectionIndex === sIdx ? "bg-primary/5" : "hover:bg-muted/40"
                        )}
                      >
                        {isQuizMode && quizSectionIndex === sIdx && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                        <div className={cn(
                          "mt-0.5 shrink-0 w-4 h-4 rounded-full border flex items-center justify-center",
                          quizScores[sIdx] != null && quizScores[sIdx] >= 80
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-violet-500/50 text-violet-500"
                        )}>
                          {quizScores[sIdx] != null && quizScores[sIdx] >= 80 ? <CheckCircle className="h-3 w-3" /> : <Puzzle className="h-2.5 w-2.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm leading-snug", isQuizMode && quizSectionIndex === sIdx ? "font-semibold text-primary" : "text-foreground/80 font-medium")}>
                            Let&apos;s test your understanding!
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground font-medium">
                            <span>Quiz · ~1 min</span>
                            {quizScores[sIdx] != null && <span>· {quizScores[sIdx]}%</span>}
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm z-0 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

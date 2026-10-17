'use client'

import { useEffect, useState, use, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CourseCertificatePreview } from '@/components/courses/CourseCertificatePreview'
import { AddToCalendarButton } from '@/components/courses/AddToCalendarButton'
import {
  BookOpen, CheckCircle, Play, Pause, Loader2,
  Star, Clock, Layers, Award, Users, ChevronDown,
  ChevronRight, Lock, ArrowLeft, Volume2, Maximize2,
  GraduationCap, TrendingUp, Zap, Shield, BarChart2, BookMarked,
  ChevronUp, Share2, Heart, Download, HelpCircle, Check, Copy, Link2
} from 'lucide-react'
import { SkeletonStats, SkeletonText, SkeletonCard } from '@/components/ui/skeleton-boneyard'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { pickResumeLessonId } from '@/lib/courses/watch-progress'
import { cn } from '@/lib/utils'
import { StatCard } from '@/components/app/page-kit'
import { Player } from '@remotion/player'
import { CourseVideoComposition } from '@/app/remotion/CourseVideo'
import { QuizComponent, type QuizQuestion } from '@/components/courses/QuizComponent'

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
  content?: string
  resources?: Resource[]
  free?: boolean
  type?: 'video' | 'text'
  videoType?: 'youtube' | 'ai'
  script?: any[]
  audioUrl?: string
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
  description: string
  type: string
  instructor: string
  duration: string
  level: string
  rating: number
  sessions: number
  enrolled: number
  category: string
  tags: string[]
  image?: string
  sections?: Section[]
  source?: string
  source_url?: string
  license?: string
  whatYoullLearn?: string[]
  introVideoUrl?: string
}

interface Progress {
  completedModules: number[]
  quizScores: Record<number, number>
  currentModule: number
  currentLessonId?: string
  skippedToFinal: boolean
  finalExamScore?: number
  certificateUrl?: string
}



function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const resolved = use(params)
  const courseId = resolved.id

  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['0']))
  const [enrolled, setEnrolled] = useState(false)
  const [saved, setSaved] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<Progress | null>(null)
  const [showQuiz, setShowQuiz] = useState<number | null>(null)
  const router = useRouter()
  const { startTour, setTourSeen } = useTour()

  // First-visit guided tour (same pattern as the other dashboard pages).
  // Gated on course load so the anchored landmarks exist on first paint.
  useEffect(() => {
    if (gate.ready && !loading && course) {
      const courseDetailTour: TourStep[] = [
        {
          target: '[data-tour="course-detail-header"]',
          title: 'Course details at glance',
          description: 'This page shows one course content, ratings, and enrollment options for learners deciding what to study.',
          position: 'bottom',
        },
        {
          target: '[data-tour="course-detail-enroll"]',
          title: 'Enroll or resume learning',
          description: 'Enroll free to unlock lessons, or resume where you stopped to keep progressing.',
          position: 'bottom',
        },
        {
          target: '[data-tour="course-detail-curriculum"]',
          title: 'Finish lessons, earn certificate',
          description: 'Complete lessons in order and pass module quizzes to unlock your verified certificate.',
          position: 'top',
        },
      ]
      autoPlayPageTour('course-detail', courseDetailTour)}
  }, [gate.ready, loading, course, startTour, setTourSeen])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/courses/${encodeURIComponent(courseId)}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/user/courses/${encodeURIComponent(courseId)}/progress`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch(`/api/user/courses/${encodeURIComponent(courseId)}/enroll`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch(`/api/user/courses/${encodeURIComponent(courseId)}/completions`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ]).then(([courseData, progressData, enrollData, completionsData]) => {
      if (courseData.data) {
        setCourse(courseData.data)
      }
      if (enrollData?.enrolled) {
        setEnrolled(true)
      } else if (typeof courseData.data?.userEnrolled === 'boolean') {
        setEnrolled(courseData.data.userEnrolled)
      }
      if (progressData && !progressData.error) {
        setProgress(progressData)
      }
      if (completionsData?.completedLessons) {
        setCompletedLessons(new Set(completionsData.completedLessons))
      }
    }).catch(() => {})
    .finally(() => setLoading(false))
  }, [courseId])

  // Save progress
  const saveProgress = async (updates: Partial<Progress>) => {
    if (!enrolled) return
    try {
      await csrfFetch(`/api/user/courses/${encodeURIComponent(courseId)}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    } catch {}
  }

  const markComplete = async (lessonId: string) => {
    const newCompleted = new Set([...completedLessons, lessonId])
    setCompletedLessons(newCompleted)
    try {
      await csrfFetch(`/api/user/courses/${encodeURIComponent(courseId)}/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId }),
      })
    } catch {}
  }

  // Check if module is complete (all lessons done + quiz passed)
  const isModuleComplete = (sectionIndex: number) => {
    return progress?.completedModules?.includes(sectionIndex) || false
  }

  // Check if module is unlocked (previous module complete, or first module)
  const isModuleUnlocked = (sectionIndex: number) => {
    if (sectionIndex === 0) return true
    return isModuleComplete(sectionIndex - 1)
  }

  const toggleSection = (idx: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }


  // Persist wishlist across refresh (Mongo-backed).
  useEffect(() => {
    if (!courseId) return
    fetch('/api/user/course-wishlist', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        const ids: string[] = Array.isArray(j?.data) ? j.data : []
        setSaved(ids.includes(courseId))
      })
      .catch(() => {})
  }, [courseId])

  // Recently viewed
  useEffect(() => {
    if (!course?.id || !course?.title) return
    void csrfFetch('/api/user/recently-viewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'course',
        id: course.id,
        title: course.title,
        href: `/dashboard/courses/${course.id}`,
      }),
    }).catch(() => {})
  }, [course?.id, course?.title])

  const toggleWishlist = async () => {
    const next = !saved
    setSaved(next)
    try {
      const res = await csrfFetch('/api/user/course-wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Wishlist update failed')
      setSaved(!!data.saved)
      addToast({
        title: data.saved ? 'Added to wishlist' : 'Removed from wishlist',
        type: 'success',
      })
    } catch (e: any) {
      setSaved(!next)
      addToast({ title: e?.message || 'Could not update wishlist', type: 'error' })
    }
  }

  const shareCourse = async (channel?: 'copy' | 'linkedin' | 'twitter' | 'native') => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const title = course?.title || 'CodeSpectra course'
    try {
      if (!channel || channel === 'native') {
        if (navigator.share) {
          await navigator.share({ title, url, text: course?.description || '' })
          addToast({ title: 'Shared', type: 'success' })
          setShareOpen(false)
          return
        }
        channel = 'copy'
      }
      if (channel === 'linkedin') {
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer')
        setShareOpen(false)
        return
      }
      if (channel === 'twitter') {
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, '_blank', 'noopener,noreferrer')
        setShareOpen(false)
        return
      }
      await navigator.clipboard.writeText(url)
      addToast({ title: 'Link copied to clipboard', type: 'success' })
      setShareOpen(false)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      addToast({ title: 'Could not share', type: 'error' })
    }
  }


const handleEnroll = async () => {
    setEnrolled(true)
    addToast({ title: `Enrolling in ${course?.title}...`, type: 'info' })
    try {
      const res = await csrfFetch(`/api/user/courses/${encodeURIComponent(courseId)}/enroll`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Enrollment failed')
      addToast({ title: `Enrolled in ${course?.title}`, type: 'success' })
    } catch (e: any) {
      setEnrolled(false)
      addToast({ title: e.message || 'Enrollment failed', type: 'error' })
    }
  }

  if (!gate.ready) return (
    <div className="w-full min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  )

  if (loading) return (
    <div className="space-y-6 py-10">
      <div className="px-4 sm:px-6 lg:px-8 space-y-6">
        <SkeletonText lines={2} />
        <SkeletonText lines={3} />
        <SkeletonStats />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )

  if (!course) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <BookOpen className="h-12 w-12 text-muted-foreground/40" />
      <h2 className="text-xl font-semibold">Course not found</h2>
      <Link href="/dashboard/courses"><Button variant="outline">Browse courses</Button></Link>
    </div>
  )

  const sections = course.sections || []
  const allLessons = sections.flatMap(s => s.lessons)
  const firstLesson = allLessons[0] || null
  const resumeLessonId = pickResumeLessonId(
    allLessons.map(l => l.id),
    progress?.currentLessonId,
    completedLessons,
  )
  const continueLesson = allLessons.find(l => l.id === resumeLessonId) || firstLesson
  const totalLessons = allLessons.length
  const lessonsWithVideo = allLessons.filter((l: any) => !!(l.videoUrl || l.mp4Url || l.video_url)).length
  const videosReadyPct = totalLessons > 0 ? Math.round((lessonsWithVideo / totalLessons) * 100) : 0
  const totalDuration = allLessons.reduce((acc, l) => acc + (l.duration || 0), 0)
  const hoursOfContent = totalDuration > 0
    ? Math.max(1, Math.round(totalDuration / 3600))
    : course.sessions || parseInt(course.duration) || 0
  const whatYoullLearn = course.whatYoullLearn || [
    `${hoursOfContent} hours of structured content`,
    'Practical exercises and assignments',
    'Real-world project experience',
    'Certificate of completion',
    'Lifetime access to materials',
    'Community doubt-clearing support'
  ]
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons.size / totalLessons) * 100) : 0

  // Career outcomes based on tags
  const careerMap: Record<string, { title: string; color: string }[]> = {
    CPP: [
      { title: 'Software engineer', color: 'from-blue-500/20 to-blue-600/5' },
      { title: 'Systems programmer', color: 'from-indigo-500/20 to-indigo-600/5' },
    ],
    Python: [
      { title: 'Data scientist', color: 'from-yellow-500/20 to-yellow-600/5' },
      { title: 'ML engineer', color: 'from-orange-500/20 to-orange-600/5' },
    ],
    Web: [
      { title: 'Frontend engineer', color: 'from-cyan-500/20 to-cyan-600/5' },
      { title: 'Full stack developer', color: 'from-teal-500/20 to-teal-600/5' },
    ]
  }
  const careerTag = (course.tags || []).find(t => careerMap[t])
  const careers = careerTag ? careerMap[careerTag] : [
    { title: 'Software engineer', color: 'from-blue-500/20 to-blue-600/5' },
    { title: 'Tech lead', color: 'from-purple-500/20 to-purple-600/5' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#2f5be7] via-[#2448c9] to-[#17224d] text-white shadow-[0_18px_40px_-20px_rgba(47,91,231,0.55)]">
        {/* soft dot field + glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(70%_90%_at_85%_20%,#000_20%,transparent_75%)]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-72 w-72 rounded-full bg-[#38bdf8]/30 blur-3xl" />

        <div className="px-6 py-8 sm:px-8 lg:px-10 lg:py-10 relative z-10" data-tour="course-detail-header">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-white/75 mb-8">
            <Link href="/dashboard/courses" className="hover:text-white flex items-center gap-1 transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Courses
            </Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <span className="text-white truncate">{course.title}</span>
          </nav>

          <div className="grid lg:grid-cols-5 gap-10 items-center">
            {/* Left: course info */}
            <div className="lg:col-span-3 space-y-6">
              {/* Category + level badge */}
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary" className="bg-white/15 text-white border-white/30 px-3 py-1">
                  {course.category || course.tags?.[0] || 'Course'}
                </Badge>
                <Badge variant="secondary" className="bg-white/10 text-white border-white/25 capitalize px-3 py-1">
                  {course.level || 'All levels'}
                </Badge>
              </div>

              <h1 className="text-3xl md:text-5xl font-black leading-tight tracking-tight text-balance">
                {course.title}
              </h1>

              <p className="text-white/85 text-lg leading-relaxed max-w-2xl">
                {course.description}
              </p>

              {/* Rating + enrolled */}
              <div className="flex flex-wrap items-center gap-5">
                {course.rating ? (
                <div className="flex items-center gap-1.5 bg-white/15 border border-white/25 text-white px-4 py-2 rounded-full text-sm font-semibold tabular-nums">
                  <Star className="h-4 w-4 fill-amber-300 text-amber-300" aria-hidden />
                  {course.rating}
                  <span className="text-white/75 font-normal">/ 5.0</span>
                </div>
                ) : null}
                <div className="flex items-center gap-2 text-white/80 text-sm tabular-nums">
                  <Users className="h-4 w-4" />
                  {course.enrolled > 0
                    ? `${course.enrolled.toLocaleString()} learners enrolled`
                    : 'Be among the first to enroll'}
                </div>
                <div className="flex items-center gap-2 text-white/80 text-sm tabular-nums">
                  <Clock className="h-4 w-4" />
                  {hoursOfContent}h of content
                </div>
              </div>

              {/* CTA */}
              <div className="flex flex-wrap items-center gap-3 pt-2" data-tour="course-detail-enroll">
                {enrolled ? (
                  <Button
                    className="bg-white text-[#2448c9] hover:bg-white/90 h-12 px-8 text-base font-semibold rounded-xl"
                    onClick={() => {
                      if (continueLesson) {
                        router.push(`/dashboard/courses/${courseId}/lesson/${continueLesson.id}`)
                      }
                    }}
                  >
                    <Play className="h-5 w-5 mr-2" /> Continue learning
                  </Button>
                ) : (
                  <Button
                    onClick={handleEnroll}
                    className="bg-white text-[#2448c9] hover:bg-white/90 h-12 px-8 text-base font-semibold rounded-xl"
                  >
                    <Zap className="h-5 w-5 mr-2" /> Enroll for free
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'}
                      onClick={toggleWishlist}
                      className={cn(
                        'h-12 w-12 rounded-xl border flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                        saved ? 'border-white/60 bg-white text-red-600' : 'border-white/30 bg-white/10 text-white hover:border-white/60 hover:bg-white/15'
                      )}
                    >
                      <Heart className={cn('h-5 w-5', saved && 'fill-red-600')} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{saved ? 'Remove from wishlist' : 'Add to wishlist'}</p>
                  </TooltipContent>
                </Tooltip>
                <AddToCalendarButton
                  courseTitle={course.title}
                  courseUrl={typeof window !== 'undefined' ? window.location.href : ''}
                />
                <div className="relative">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Share course"
                        onClick={() => setShareOpen(v => !v)}
                        className="h-12 w-12 rounded-xl border border-white/30 bg-white/10 flex items-center justify-center text-white hover:border-white/60 hover:bg-white/15 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        <Share2 className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>Share course</p>
                    </TooltipContent>
                  </Tooltip>
                  {shareOpen && (
                    <div className="absolute left-0 top-14 z-30 w-52 rounded-2xl border border-border bg-card text-foreground shadow-xl p-2 space-y-1">
                      <button type="button" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted text-left" onClick={() => shareCourse('copy')}>
                        <Copy className="h-4 w-4" /> Copy link
                      </button>
                      <button type="button" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted text-left" onClick={() => shareCourse('linkedin')}>
                        <Link2 className="h-4 w-4" /> LinkedIn
                      </button>
                      <button type="button" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted text-left" onClick={() => shareCourse('twitter')}>
                        <Share2 className="h-4 w-4" /> X / Twitter
                      </button>
                      <button type="button" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted text-left" onClick={() => shareCourse('native')}>
                        <Share2 className="h-4 w-4" /> More…
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: thumbnail preview */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl overflow-hidden border border-white/20 shadow-2xl shadow-[#17224d]/50 bg-[#17224d]">
                <div className="relative aspect-video bg-linear-to-br from-[#2f5be7] to-[#17224d] flex items-center justify-center">
                  <img
                    src={course.image || '/courses/cpp.jpg'}
                    alt={course.title}
                    className="absolute inset-0 w-full h-full object-cover opacity-40"
                  />
                  <div className="relative z-10 flex flex-col items-center gap-3 text-white cursor-pointer" onClick={() => continueLesson && router.push(`/dashboard/courses/${courseId}/lesson/${continueLesson.id}`)}>
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 transition-transform duration-200 hover:scale-110 motion-reduce:hover:scale-100">
                      <Play className="h-8 w-8 fill-white ml-1" aria-hidden />
                    </div>
                    <p className="text-sm font-medium text-white/90">Start course</p>
                  </div>
                </div>
                {/* Course title bar below video */}
                <div className="px-5 py-4 bg-[#17224d]/90 backdrop-blur-sm">
                  <p className="font-semibold text-white text-sm truncate">{course.title}</p>
                  <p className="text-xs text-white/75 mt-0.5">Learn at your own pace</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { icon: Layers, label: 'Modules', value: sections.length || 1 },
              { icon: BookOpen, label: 'Lessons', value: totalLessons || course.sessions || 0 },
              { icon: Clock, label: 'Hours', value: hoursOfContent },
              { icon: Users, label: 'Enrolled', value: course.enrolled > 0 ? (course.enrolled >= 1000 ? `${(course.enrolled / 1000).toFixed(1)}k` : course.enrolled.toLocaleString()) : '0' },
              { icon: Award, label: 'Certificate', value: 'Yes' },
            ].map((s, i) => (
              <StatCard key={i} label={s.label} value={s.value} icon={<s.icon />} />
            ))}
      </div>

      {/* ── Main Content ── */}
      <div className="pt-4" data-tour="course-detail-curriculum">
        <div className="grid lg:grid-cols-3 gap-10">

          {/* Left col — main content */}
          <div className="lg:col-span-2 space-y-12">

            {/* Progress bar (if enrolled) */}
            {enrolled && totalLessons > 0 && (
              <div className="bg-card rounded-3xl border border-border/70 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold">Your progress</p>
                  <p className="text-sm font-bold tabular-nums text-primary">{progressPercent}%</p>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-label="Course progress">
                  <div
                    className="h-full bg-primary transition-all duration-700 motion-reduce:transition-none rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums mt-2">{completedLessons.size} of {totalLessons} lessons completed</p>
              </div>
            )}

            {/* Video Player Panel - Removed, moved to dedicated lesson page */}

            {/* Video readiness */}
            {totalLessons > 0 && (
              <div className={cn(
                'rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3',
                lessonsWithVideo >= totalLessons
                  ? 'border-green-500/30 bg-green-500/10'
                  : lessonsWithVideo > 0
                    ? 'border-amber-500/30 bg-amber-500/10'
                    : 'border-border/60 bg-muted/40'
              )}>
                <div>
                  <p className="text-sm font-semibold">
                    {lessonsWithVideo >= totalLessons
                      ? 'All lesson videos ready'
                      : lessonsWithVideo > 0
                        ? 'Some lesson videos are still being added'
                        : 'Lesson videos are coming soon'}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                    {lessonsWithVideo} of {totalLessons} lessons have video ({videosReadyPct}%).{' '}
                    {lessonsWithVideo < totalLessons
                      ? 'You can enroll now and start the modules that are ready. Your certificate unlocks when you finish.'
                      : 'The whole course is ready, including the certificate.'}
                  </p>
                </div>
                <Link href="/dashboard/courses/wishlist" className="text-xs font-medium text-primary hover:underline">
                  View wishlist
                </Link>
              </div>
            )}

            {/* About the course */}
            <section>
              <h2 className="text-xl font-semibold mb-4">About the course</h2>
              <div className="rounded-3xl border border-border/70 bg-card p-6 space-y-4">
                <p className="text-muted-foreground leading-relaxed">
                  {course.description || `${course.title} is a structured, hands-on program with short video lessons, practice, and a verified certificate when you finish.`}
                </p>
</div>
            </section>

            {/* Skills you'll learn — Unstop-style check pills */}
            <section>
              <h2 className="text-xl font-semibold mb-2">Skills you will learn</h2>
              <p className="text-sm text-muted-foreground mb-5">Practical abilities you pick up across the modules</p>
              <div className="flex flex-wrap gap-2.5">
                {(course.tags?.length ? course.tags : whatYoullLearn.slice(0, 8)).map((item, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-sm font-medium text-primary"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                    {item}
                  </span>
                ))}
              </div>
            </section>

            {/* What you'll learn — outcomes */}
            <section>
              <h2 className="text-xl font-semibold mb-4">What you'll learn</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {whatYoullLearn.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 bg-card border border-border/70 rounded-2xl p-4 hover:border-primary/30 transition-colors">
                    <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden />
                    <span className="text-sm font-medium leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Course Curriculum */}
            {sections.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">Course curriculum</h2>
                  <p className="text-sm text-muted-foreground tabular-nums">{totalLessons} lessons · {formatDuration(totalDuration)} total</p>
                </div>
                <div className="space-y-3">
                  {sections.map((section, sIdx) => {
                    const isOpen = openSections.has(String(sIdx))
                    const sectionDuration = section.lessons.reduce((acc, l) => acc + (l.duration || 0), 0)
                    return (
                      <div key={section.slug} className="rounded-2xl border border-border/70 overflow-hidden bg-card">
                        {/* Section header */}
                        <button
                          onClick={() => toggleSection(String(sIdx))}
                          aria-expanded={isOpen}
                          className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                              {sIdx + 1}
                            </div>
                            <div>
                              <p className="font-semibold">{section.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {section.lessons.length} lessons{sectionDuration > 0 ? ` · ${formatDuration(sectionDuration)}` : ''}
                              </p>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                        </button>

                        {/* Lessons */}
                        {isOpen && (
                          <div className="divide-y divide-border/40">
                            {section.lessons.map((lesson, lIdx) => {
                              const isDone = completedLessons.has(lesson.id)
                              const isLocked = !lesson.free && !enrolled

                              return (
                                <button
                                  key={lesson.id}
                                  disabled={isLocked}
                                  onClick={() => {
                                    if (!isLocked) {
                                      router.push(`/dashboard/courses/${courseId}/lesson/${lesson.id}`)
                                    }
                                  }}
                                  className={cn(
                                    'w-full flex items-center gap-4 px-5 py-3.5 text-left transition-all',
                                    'border-l-4 border-transparent hover:bg-muted/30',
                                    isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                  )}
                                >
                                  {/* Status icon */}
                                  <div className={cn(
                                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                                    isDone ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'
                                  )}>
                                    {isDone ? <CheckCircle className="h-4 w-4" /> :
                                     isLocked ? <Lock className="h-3.5 w-3.5" /> :
                                     lIdx + 1}
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate text-foreground">{lesson.title}</p>
                                    {lesson.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{lesson.description}</p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    {lesson.free && !enrolled && (
                                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 px-2 py-0.5">Free</Badge>
                                    )}
                                    {lesson.duration && (
                                      <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(lesson.duration)}</span>
                                    )}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {/* Module Quiz */}
                        {isOpen && enrolled && section.quiz && section.quiz.length > 0 && (
                          <div className="p-4 border-t border-border/50">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Module quiz</span>
                                {isModuleComplete(sIdx) && (
                                  <Badge className="text-xs tabular-nums bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">
                                    Passed: {progress?.quizScores?.[sIdx] || 0}%
                                  </Badge>
                                )}
                              </div>
                              {!isModuleComplete(sIdx) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowQuiz(showQuiz === sIdx ? null : sIdx)}
                                >
                                  {showQuiz === sIdx ? 'Hide quiz' : 'Take quiz'}
                                </Button>
                              )}
                            </div>
                            {showQuiz === sIdx && (
                              <QuizComponent
                                questions={section.quiz}
                                reviewHref={
                                  section.lessons?.[0]?.id
                                    ? `/dashboard/courses/${courseId}/lesson/${section.lessons[0].id}`
                                    : undefined
                                }
                                reviewLabel={
                                  section.lessons?.[0]?.title
                                    ? `Review: ${section.lessons[0].title}`
                                    : 'Review module lessons'
                                }
                                onComplete={(score, total) => {
                                  if (score >= total * 0.8) {
                                    addToast({ type: 'success', title: `Passed! ${Math.round(score/total*100)}%` })
                                    saveProgress({
                                      completedModules: [...(progress?.completedModules || []), sIdx],
                                      quizScores: { ...(progress?.quizScores || {}), [sIdx]: Math.round(score/total*100) },
                                    })
                                  } else {
                                    addToast({ type: 'error', title: `Not yet — ${Math.round(score/total*100)}% (need 80%)` })
                                  }
                                  setShowQuiz(null)
                                }}
                              />
                            )}
                            {isModuleComplete(sIdx) && !showQuiz && (
                              <p className="text-xs text-muted-foreground">Module complete. Move on to the next one.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Career Outcomes */}
            <section>
              <h2 className="text-xl font-semibold mb-2">Roles this course helps with</h2>
              <p className="text-muted-foreground mb-5">Skills from this course are used in roles like these.</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {careers.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-5">
                    <div className="w-11 h-11 rounded-xl border border-primary/20 bg-primary/10 text-primary flex items-center justify-center">
                      <TrendingUp className="h-5 w-5" aria-hidden />
                    </div>
                    <h3 className="font-semibold text-foreground">{c.title}</h3>
                  </div>
                ))}
              </div>
            </section>

            {/* FAQ */}
            <section>
              <h2 className="text-xl font-semibold mb-4">Frequently asked questions</h2>
              <div className="space-y-3">
                {[
                  { q: 'Who is this course for?', a: `This course is designed for learners at ${course.level || 'all'} levels. Whether you're just starting or upskilling, the content is structured to help you grow step by step.` },
                  { q: 'Do I get lifetime access?', a: 'Yes! Once enrolled, you have lifetime access to all lessons, including future content updates at no extra cost.' },
                  { q: 'Are there prerequisites?', a: course.level === 'beginner' ? 'No prior knowledge required. We start from the very basics.' : 'Basic programming knowledge is recommended. Check the "What you\'ll learn" section for specifics.' },
                  { q: 'Will I get a certificate?', a: 'Yes. After completing all lessons, you\'ll receive a verified certificate you can share on LinkedIn and add to your resume.' },
                  { q: 'Can I watch on mobile?', a: 'Absolutely. The platform is fully responsive and all videos play natively on mobile, tablet, and desktop.' },
                ].map((faq, i) => (
                  <details key={i} className="group rounded-2xl border border-border/70 bg-card overflow-hidden">
                    <summary className="flex items-center justify-between p-5 cursor-pointer font-semibold hover:bg-muted/40 transition-colors list-none [&::-webkit-details-marker]:hidden">
                      {faq.q}
                      <ChevronDown className="h-5 w-5 text-muted-foreground group-open:rotate-180 transition-transform duration-300 motion-reduce:transition-none shrink-0 ml-4" />
                    </summary>
                    <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-4">
                      {faq.a}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          </div>

          {/* Right sidebar — sticky */}
          <div className="space-y-6">
            <div className="sticky top-6 space-y-5">
              {/* Enroll card */}
              <Card className="rounded-3xl border-border/70 overflow-hidden">
                <div className="h-1 bg-primary" />
                <div className="p-6 space-y-5">
                  <div>
                    <p className="text-3xl font-black text-foreground">Free</p>
                    <p className="text-sm text-muted-foreground mt-1">Full lifetime access</p>
                  </div>

                  {enrolled ? (
                    <Button
                      className="w-full h-12 font-semibold rounded-xl"
                      onClick={() => {
                        if (continueLesson) {
                          router.push(`/dashboard/courses/${courseId}/lesson/${continueLesson.id}`)
                        }
                      }}
                    >
                      <Play className="h-5 w-5 mr-2 fill-current" /> Continue learning
                    </Button>
                  ) : (
                    <Button onClick={handleEnroll} className="w-full h-12 font-semibold rounded-xl">
                      <Zap className="h-5 w-5 mr-2" /> Start learning
                    </Button>
                  )}

                  <Button variant="outline" className="w-full h-11 rounded-xl" asChild>
                    <Link href="/dashboard/courses">Browse other courses</Link>
                  </Button>

                  <div className="pt-2 space-y-3 text-sm">
                    {[
                      { icon: BookOpen, text: `${totalLessons || course.sessions || 0} lessons included` },
                      { icon: Clock, text: `${hoursOfContent} hours of content` },
                      { icon: Layers, text: `${sections.length || 1} modules` },
                      { icon: Award, text: 'Certificate of completion' },
                      { icon: Download, text: 'Downloadable resources' },
                      { icon: Shield, text: 'Lifetime access' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3 text-muted-foreground">
                        <item.icon className="h-4 w-4 shrink-0 text-primary/70" />
                        {item.text}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Course highlights */}
              <Card className="rounded-3xl border-border/70 p-5 space-y-4">
                <h3 className="font-semibold text-base">Course details</h3>
                <div className="space-y-3 text-sm">
                  {[
                    { label: 'Level', value: course.level || 'All levels', icon: BarChart2 },
                    { label: 'Duration', value: `${hoursOfContent} hours`, icon: Clock },
                    { label: 'Rating', value: course.rating ? `${course.rating} / 5.0` : 'Not rated yet', icon: Star },
                    { label: 'Instructor', value: course.instructor || 'CodeSpectra', icon: GraduationCap },
                    { label: 'Language', value: 'English', icon: BookMarked },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <row.icon className="h-4 w-4" />
                        {row.label}
                      </div>
                      <span className="font-semibold capitalize">{row.value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* ── Certificate Section ── */}
        <div className="mt-16 rounded-3xl overflow-hidden relative bg-linear-to-br from-[#2f5be7] via-[#2448c9] to-[#17224d] text-white px-6 sm:px-8 md:px-14 py-12 md:py-14 shadow-[0_18px_40px_-20px_rgba(47,91,231,0.55)]">
          <div aria-hidden className="absolute -top-16 -right-10 w-80 h-80 bg-[#38bdf8]/30 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/30 text-white text-sm font-semibold">
                <Award className="h-4 w-4 text-amber-300" aria-hidden /> Verified certificate
              </div>
              <h2 className="text-3xl md:text-4xl font-black leading-tight">
                Earn a certificate worth adding to your portfolio
              </h2>
              <p className="text-white/85 leading-relaxed">
                Finish {course.title} and get a certificate anyone can verify online. Add it to LinkedIn and your resume.
              </p>
              <ul className="space-y-3">
                {['Shareable on LinkedIn & resume', 'Unique online verification link', 'Printable high-resolution PDF'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/90">
                    <CheckCircle className="h-5 w-5 text-white shrink-0" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              {!enrolled && (
                <Button onClick={handleEnroll} className="h-12 px-8 font-semibold rounded-xl bg-white text-[#2448c9] hover:bg-white/90">
                  Get certified for free
                </Button>
              )}
            </div>

            {/* Real SuperAdmin template + SAMPLE watermark */}
            <div className="flex justify-center rotate-1 hover:rotate-0 transition-transform duration-500 motion-reduce:rotate-0">
              <CourseCertificatePreview
                courseTitle={course.title}
                recipientName={gate.user?.name || gate.user?.email?.split("@")[0] || undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

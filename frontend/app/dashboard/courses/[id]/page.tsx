'use client'

import { useEffect, useState, use, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen, CheckCircle, Play, Pause, Loader2,
  Star, Clock, Layers, Award, Users, ChevronDown,
  ChevronRight, Lock, ArrowLeft, Volume2, Maximize2,
  GraduationCap, TrendingUp, Zap, Shield, BarChart2, BookMarked,
  ChevronUp, Share2, Heart, Download
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { cn } from '@/lib/utils'
import { Player } from '@remotion/player'
import { CourseVideoComposition } from '@/app/remotion/CourseVideo'

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
}

interface Section {
  title: string
  slug: string
  lessons: Lesson[]
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
}



function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function VideoPlayer({ url, title }: { url: string; title: string }) {
  // Convert normal YouTube URL to embed if needed
  const embedUrl = url.includes('youtube.com/embed') ? url
    : url.includes('youtu.be/') ? `https://www.youtube.com/embed/${url.split('youtu.be/')[1]?.split('?')[0]}`
    : url.includes('youtube.com/watch') ? `https://www.youtube.com/embed/${new URLSearchParams(url.split('?')[1]).get('v')}`
    : url

  return (
    <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
      <iframe
        src={embedUrl}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 w-full h-full rounded-xl"
        loading="lazy"
      />
    </div>
  )
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
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set())
  const router = useRouter()

  useEffect(() => {
    setLoading(true)
    fetch(`/api/courses/${encodeURIComponent(courseId)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (j.data) {
          setCourse(j.data)
          if (typeof j.data.userEnrolled === 'boolean') setEnrolled(j.data.userEnrolled)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [courseId])

  // Mark lesson complete
  const markComplete = (lessonId: string) => {
    setCompletedLessons(prev => new Set([...prev, lessonId]))
  }

  const toggleSection = (idx: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

const handleEnroll = () => {
  setEnrolled(true)
  addToast({ title: `Enrolled in ${course?.title}`, type: 'success' })
  fetch(`/api/courses/${encodeURIComponent(courseId)}`, {
    method: 'POST',
    credentials: 'include',
  }).then(r => r.json()).then(() => {}).catch(() => {
    setEnrolled(false)
    addToast({ title: 'Enrollment failed — please try again.', type: 'error' })
  })
}

  if (!gate.ready) return (
    <div className="w-full min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  )

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading course…</p>
    </div>
  )

  if (!course) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <BookOpen className="h-12 w-12 text-muted-foreground/40" />
      <h2 className="text-xl font-semibold">Course not found</h2>
      <Link href="/dashboard/courses"><Button variant="outline">Browse Courses</Button></Link>
    </div>
  )

  const sections = course.sections || []
  const allLessons = sections.flatMap(s => s.lessons)
  const firstLesson = allLessons[0] || null
  const totalLessons = allLessons.length
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
  const progress = totalLessons > 0 ? Math.round((completedLessons.size / totalLessons) * 100) : 0

  // Career outcomes based on tags
  const careerMap: Record<string, { title: string; growth: string; salary: string; color: string }[]> = {
    CPP: [
      { title: 'Software Engineer', growth: '+28%', salary: '$85k–$130k', color: 'from-blue-500/20 to-blue-600/5' },
      { title: 'Systems Programmer', growth: '+22%', salary: '$90k–$140k', color: 'from-indigo-500/20 to-indigo-600/5' },
    ],
    Python: [
      { title: 'Data Scientist', growth: '+35%', salary: '$90k–$145k', color: 'from-yellow-500/20 to-yellow-600/5' },
      { title: 'ML Engineer', growth: '+42%', salary: '$110k–$170k', color: 'from-orange-500/20 to-orange-600/5' },
    ],
    Web: [
      { title: 'Frontend Engineer', growth: '+25%', salary: '$75k–$125k', color: 'from-cyan-500/20 to-cyan-600/5' },
      { title: 'Full Stack Developer', growth: '+30%', salary: '$85k–$145k', color: 'from-teal-500/20 to-teal-600/5' },
    ]
  }
  const careerTag = (course.tags || []).find(t => careerMap[t])
  const careers = careerTag ? careerMap[careerTag] : [
    { title: 'Software Engineer', growth: '+25%', salary: '$80k–$130k', color: 'from-blue-500/20 to-blue-600/5' },
    { title: 'Tech Lead', growth: '+30%', salary: '$100k–$160k', color: 'from-purple-500/20 to-purple-600/5' },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-[#0d1b3e] to-slate-900 text-white">
        {/* Ambient glow blobs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 w-64 h-64 bg-cyan-500/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-16 relative z-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-white/50 mb-8">
            <Link href="/dashboard/courses" className="hover:text-white flex items-center gap-1 transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Courses
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-white/70">{course.title}</span>
          </div>

          <div className="grid lg:grid-cols-5 gap-10 items-center">
            {/* Left: course info */}
            <div className="lg:col-span-3 space-y-6">
              {/* Category + level badge */}
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 px-3 py-1">
                  {course.category || course.tags?.[0] || 'Course'}
                </Badge>
                <Badge className="bg-white/10 text-white/80 border-white/20 capitalize px-3 py-1">
                  {course.level || 'All levels'}
                </Badge>
              </div>

              <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight">
                {course.title}
              </h1>

              <p className="text-white/70 text-lg leading-relaxed max-w-2xl">
                {course.description}
              </p>

              {/* Rating + enrolled */}
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/20 text-amber-400 px-4 py-2 rounded-full text-sm font-semibold">
                  <Star className="h-4 w-4 fill-amber-400" />
                  {course.rating || 4.5}
                  <span className="text-amber-400/60 font-normal">/ 5.0</span>
                </div>
                <div className="flex items-center gap-2 text-white/60 text-sm">
                  <Users className="h-4 w-4" />
                  {course.enrolled > 0
                    ? `${course.enrolled.toLocaleString()} learners enrolled`
                    : 'Be among the first to enroll'}
                </div>
                <div className="flex items-center gap-2 text-white/60 text-sm">
                  <Clock className="h-4 w-4" />
                  {hoursOfContent}h of content
                </div>
              </div>

              {/* CTA */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {enrolled ? (
                  <Button
                    className="bg-emerald-500 hover:bg-emerald-600 text-white h-12 px-8 text-base font-semibold shadow-lg shadow-emerald-500/20 rounded-xl"
                    onClick={() => {
                      if (firstLesson) {
                        router.push(`/dashboard/courses/${courseId}/lesson/${firstLesson.id}`)
                      }
                    }}
                  >
                    <Play className="h-5 w-5 mr-2" /> Continue Learning
                  </Button>
                ) : (
                  <Button
                    onClick={handleEnroll}
                    className="bg-blue-600 hover:bg-blue-700 text-white h-12 px-8 text-base font-semibold shadow-lg shadow-blue-600/20 rounded-xl"
                  >
                    <Zap className="h-5 w-5 mr-2" /> Enroll Now — Free
                  </Button>
                )}
                <button
                  onClick={() => setSaved(!saved)}
                  className={cn(
                    'h-12 w-12 rounded-xl border flex items-center justify-center transition-all',
                    saved ? 'border-red-500/50 bg-red-500/10 text-red-400' : 'border-white/20 bg-white/5 text-white/60 hover:border-white/40 hover:text-white'
                  )}
                >
                  <Heart className={cn('h-5 w-5', saved && 'fill-red-400')} />
                </button>
                <button className="h-12 w-12 rounded-xl border border-white/20 bg-white/5 flex items-center justify-center text-white/60 hover:border-white/40 hover:text-white transition-all">
                  <Share2 className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Right: thumbnail preview */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50 bg-black">
                <div className="relative aspect-video bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
                  <img
                    src={course.image || '/courses/cpp.jpg'}
                    alt={course.title}
                    className="absolute inset-0 w-full h-full object-cover opacity-40"
                  />
                  <div className="relative z-10 flex flex-col items-center gap-3 text-white cursor-pointer" onClick={() => firstLesson && router.push(`/dashboard/courses/${courseId}/lesson/${firstLesson.id}`)}>
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 transition-transform hover:scale-110">
                      <Play className="h-8 w-8 fill-white ml-1" />
                    </div>
                    <p className="text-sm font-medium opacity-80">Start Course</p>
                  </div>
                </div>
                {/* Course title bar below video */}
                <div className="px-5 py-4 bg-slate-900/80 backdrop-blur-sm">
                  <p className="font-semibold text-white text-sm truncate">{course.title}</p>
                  <p className="text-xs text-white/50 mt-0.5">Learn at your own pace</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* ── Stats bar ── */}
      <div className="bg-card border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 divide-x divide-border/60">
            {[
              { icon: Layers, label: 'Modules', value: sections.length || 1, color: 'text-purple-500' },
              { icon: BookOpen, label: 'Lessons', value: totalLessons || course.sessions || 0, color: 'text-blue-500' },
              { icon: Clock, label: 'Hours', value: hoursOfContent, color: 'text-orange-500' },
              { icon: Users, label: 'Enrolled', value: course.enrolled > 0 ? `${(course.enrolled / 1000).toFixed(1)}k` : '0', color: 'text-green-500' },
              { icon: Award, label: 'Certificate', value: 'Yes', color: 'text-pink-500' },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center justify-center py-5 px-4 gap-1">
                <s.icon className={cn('h-5 w-5 mb-1', s.color)} />
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-3 gap-10">

          {/* Left col — main content */}
          <div className="lg:col-span-2 space-y-12">

            {/* Progress bar (if enrolled) */}
            {enrolled && totalLessons > 0 && (
              <div className="bg-card rounded-2xl border border-border/60 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold">Your Progress</p>
                  <p className="text-sm font-bold text-primary">{progress}%</p>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-700 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{completedLessons.size} / {totalLessons} lessons completed</p>
              </div>
            )}

            {/* Video Player Panel - Removed, moved to dedicated lesson page */}

            {/* What you'll learn */}
            <section>
              <h2 className="text-2xl font-bold mb-6">What you'll learn</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {whatYoullLearn.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 bg-card border border-border/50 rounded-xl p-4 hover:border-primary/30 transition-colors">
                    <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-sm font-medium leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Course Curriculum */}
            {sections.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">Course Curriculum</h2>
                  <p className="text-sm text-muted-foreground">{totalLessons} lessons · {formatDuration(totalDuration)} total</p>
                </div>
                <div className="space-y-3">
                  {sections.map((section, sIdx) => {
                    const isOpen = openSections.has(String(sIdx))
                    const sectionDuration = section.lessons.reduce((acc, l) => acc + (l.duration || 0), 0)
                    return (
                      <div key={section.slug} className="rounded-xl border border-border/60 overflow-hidden bg-card">
                        {/* Section header */}
                        <button
                          onClick={() => toggleSection(String(sIdx))}
                          className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
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
                                    isDone ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'
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
                                      <Badge className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-2 py-0.5">Free</Badge>
                                    )}
                                    {lesson.duration && (
                                      <span className="text-xs text-muted-foreground">{formatDuration(lesson.duration)}</span>
                                    )}
                                  </div>
                                </button>
                              )
                            })}
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
              <h2 className="text-2xl font-bold mb-2">Career Growth After This Course</h2>
              <p className="text-muted-foreground mb-6">Skills that unlock new opportunities</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {careers.map((c, i) => (
                  <div key={i} className={cn('rounded-2xl p-5 bg-gradient-to-br border border-border/60 hover:shadow-lg transition-all', c.color)}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-foreground" />
                      </div>
                      <h3 className="font-bold">{c.title}</h3>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Job Growth</span>
                        <span className="font-bold text-emerald-500">{c.growth}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg. Salary</span>
                        <span className="font-semibold">{c.salary}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* FAQ */}
            <section>
              <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
              <div className="space-y-3">
                {[
                  { q: 'Who is this course for?', a: `This course is designed for learners at ${course.level || 'all'} levels. Whether you're just starting or upskilling, the content is structured to help you grow step by step.` },
                  { q: 'Do I get lifetime access?', a: 'Yes! Once enrolled, you have lifetime access to all lessons, including future content updates at no extra cost.' },
                  { q: 'Are there prerequisites?', a: course.level === 'beginner' ? 'No prior knowledge required. We start from the very basics.' : 'Basic programming knowledge is recommended. Check the "What you\'ll learn" section for specifics.' },
                  { q: 'Will I get a certificate?', a: 'Yes. After completing all lessons, you\'ll receive a verified certificate you can share on LinkedIn and add to your resume.' },
                  { q: 'Can I watch on mobile?', a: 'Absolutely. The platform is fully responsive and all videos play natively on mobile, tablet, and desktop.' },
                ].map((faq, i) => (
                  <details key={i} className="group rounded-xl border border-border/60 bg-card overflow-hidden">
                    <summary className="flex items-center justify-between p-5 cursor-pointer font-semibold hover:bg-muted/40 transition-colors list-none [&::-webkit-details-marker]:hidden">
                      {faq.q}
                      <ChevronDown className="h-5 w-5 text-muted-foreground group-open:rotate-180 transition-transform duration-300 shrink-0 ml-4" />
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
              <Card className="border-border/60 shadow-xl overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
                <div className="p-6 space-y-5">
                  <div>
                    <p className="text-3xl font-black text-foreground">Free</p>
                    <p className="text-sm text-muted-foreground mt-1">Full lifetime access</p>
                  </div>

                  {enrolled ? (
                    <Button
                      className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl"
                      onClick={() => {
                        if (firstLesson) {
                          router.push(`/dashboard/courses/${courseId}/lesson/${firstLesson.id}`)
                        }
                      }}
                    >
                      <Play className="h-5 w-5 mr-2 fill-white" /> Continue Learning
                    </Button>
                  ) : (
                    <Button onClick={handleEnroll} className="w-full h-12 font-semibold rounded-xl">
                      <Zap className="h-5 w-5 mr-2" /> Start Learning Now
                    </Button>
                  )}

                  <Button variant="outline" className="w-full h-11 rounded-xl" asChild>
                    <Link href="/dashboard/courses">Browse Other Courses</Link>
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
              <Card className="border-border/60 p-5 space-y-4">
                <h3 className="font-bold text-base">Course Details</h3>
                <div className="space-y-3 text-sm">
                  {[
                    { label: 'Level', value: course.level || 'All levels', icon: BarChart2 },
                    { label: 'Duration', value: `${hoursOfContent} hours`, icon: Clock },
                    { label: 'Rating', value: `${course.rating || 4.5} / 5.0`, icon: Star },
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

                <div className="pt-3 border-t border-border/50">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Skills you'll gain</p>
                  <div className="flex flex-wrap gap-2">
                    {(course.tags || []).map(t => (
                      <Badge key={t} variant="secondary" className="text-xs font-medium px-3 py-1">{t}</Badge>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* ── Certificate Section ── */}
        <div className="mt-20 rounded-3xl overflow-hidden relative bg-gradient-to-br from-slate-900 via-[#0d1b3e] to-slate-950 text-white px-8 md:px-14 py-14">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600/20 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400/15 border border-amber-400/20 text-amber-300 text-sm font-semibold">
                <Award className="h-4 w-4" /> Verified Certificate
              </div>
              <h2 className="text-3xl md:text-4xl font-black leading-tight">
                Earn a certificate worth adding to your portfolio
              </h2>
              <p className="text-white/70 leading-relaxed">
                Complete {course.title} and receive a verifiable certificate. Showcase it on LinkedIn, add it to your resume, and stand out to recruiters worldwide.
              </p>
              <ul className="space-y-3">
                {['Shareable on LinkedIn & resume', 'Unique online verification link', 'Printable high-resolution PDF'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/80">
                    <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              {!enrolled && (
                <Button onClick={handleEnroll} className="h-12 px-8 font-semibold rounded-xl bg-white text-slate-900 hover:bg-white/90">
                  Get Certified — Free
                </Button>
              )}
            </div>

            {/* Certificate mockup */}
            <div className="flex justify-center">
              <div className="w-full max-w-sm aspect-[4/3] bg-white rounded-2xl shadow-2xl p-5 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                <div className="w-full h-full border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-center p-6 gap-4">
                  <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                    <Award className="h-8 w-8 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Certificate of Completion</p>
                    <p className="text-lg font-black text-slate-800 mt-1">{course.title}</p>
                  </div>
                  <div className="w-full border-t border-slate-200 pt-3">
                    <p className="text-xs text-slate-400">Issued by CodeSpectra • Verified</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

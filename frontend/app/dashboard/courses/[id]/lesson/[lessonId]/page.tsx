'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { 
  ArrowLeft, CheckCircle, Play, Lock, Loader2, 
  Menu, X, ChevronDown, ChevronUp, BookOpen 
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { cn } from '@/lib/utils'
import { useToast } from '@/lib/toast-context'
import { VideoPlayer } from '@/components/ui/video-player'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
  textContent?: string
}

interface Section {
  title: string
  slug: string
  lessons: Lesson[]
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

function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('/') && typeof window !== 'undefined') return `${window.location.origin}${url}`
  return url
}

function scriptAsMarkdown(script: any[]): string {
  return script.map((s: any) => {
    const bullets = Array.isArray(s.content) ? s.content : s.content ? [s.content] : []
    return `## ${s.title || 'Slide'}\n\n${bullets.map((b: string) => `- ${b}`).join('\n')}`
  }).join('\n\n')
}


export default function LessonPlayerPage({ params }: { params: Promise<{ id: string, lessonId: string }> }) {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const router = useRouter()
  const resolved = use(params)
  const { id: courseId, lessonId } = resolved

  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['0']))
  const [viewMode, setViewMode] = useState<'video' | 'text'>('video')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/courses/${encodeURIComponent(courseId)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (j.data) {
          setCourse(j.data)
          // Find the section that contains the current lesson and open it
          const sections = j.data.sections || []
          const sectionIdx = sections.findIndex((s: Section) => s.lessons.some(l => l.id === lessonId))
          if (sectionIdx !== -1) {
            setOpenSections(new Set([String(sectionIdx)]))
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [courseId, lessonId])

  if (!gate.ready || loading) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Loading lesson...</p>
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

  const allLessons = sections.flatMap(s => s.lessons)
  const activeIndex = allLessons.findIndex(l => l.id === lessonId)
  
  if (activeIndex !== -1) {
    activeLesson = allLessons[activeIndex]
    if (activeIndex > 0) prevLesson = allLessons[activeIndex - 1]
    if (activeIndex < allLessons.length - 1) nextLesson = allLessons[activeIndex + 1]
  }

  if (!activeLesson) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-background gap-4">
        <BookOpen className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">Lesson not found</h2>
        <Button onClick={() => router.push(`/dashboard/courses/${courseId}`)}>Back to Course</Button>
      </div>
    )
  }

  const markComplete = (id: string) => {
    setCompletedLessons(prev => new Set([...prev, id]))
    addToast({ title: 'Lesson marked as complete!', type: 'success' })
  }

  const toggleSection = (idx: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const isDone = completedLessons.has(activeLesson.id)

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
              <span>{activeLesson.title}</span>
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
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Main Video Area ── */}
        <main className="flex-1 flex flex-col min-w-0 bg-black/5 dark:bg-black/40">
          <div className="flex-1 p-0 sm:p-4 lg:p-6 overflow-y-auto">
            <div className="max-w-5xl mx-auto w-full space-y-6">
              
              {/* Content Header & Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold">{activeLesson.title}</h2>
                </div>
                
                {(activeLesson.textContent || activeLesson.script?.length) && (
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

              {/* Conditional Content Area */}
              <div className="mt-6">
                {viewMode === 'video' ? (
                  <div className="w-full aspect-video bg-black sm:rounded-2xl overflow-hidden shadow-2xl relative border border-border/20">
                    {activeLesson.videoUrl ? (
                      <VideoPlayer
                        src={resolveMediaUrl(activeLesson.videoUrl)}
                        title={activeLesson.title}
                        className="w-full h-full border-0 rounded-none"
                      />
                    ) : activeLesson.url ? (
                      <VideoPlayer src={activeLesson.url} title={activeLesson.title} className="w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground bg-black">
                        <Play className="h-10 w-10 opacity-40" />
                        <p className="text-sm">MP4 not generated yet. Open Course Generator and regenerate this course.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="prose prose-slate dark:prose-invert max-w-none prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 bg-card rounded-2xl p-8 border border-border/40 shadow-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeLesson.textContent || (activeLesson.script?.length ? scriptAsMarkdown(activeLesson.script) : 'No text content available for this lesson.')}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Lesson Details & Footer */}
              <div className="px-4 sm:px-0 space-y-6 pb-20 pt-8 mt-8 border-t border-border/40">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div>
                    {activeLesson.description && (
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed max-w-3xl">
                        {activeLesson.description}
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
          "absolute lg:static top-0 right-0 h-full w-full sm:w-80 lg:w-96 bg-card border-l border-border/40 shadow-2xl lg:shadow-none transition-transform duration-300 z-10 flex flex-col",
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

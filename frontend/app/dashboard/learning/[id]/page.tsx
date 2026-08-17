'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, CheckCircle, Play, ArrowRight, Loader2, AlertCircle, ExternalLink, MonitorPlay, ShieldCheck } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'

interface Resource {
  title?: string
  url?: string
  embed_url?: string
  provider?: string
  license?: string
  playback_type?: string
  status?: string
  duration?: number
}

interface Lesson {
  id: string
  title: string
  slug: string
  description?: string
  url?: string
  resources?: Resource[]
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
  tags: string[]
  source: string
  source_url: string
  license: string
  rating: number
  sections: Section[]
}

function EmbedPlayer({ resource, title }: { resource: Resource; title: string }) {
  const embedUrl = resource.embed_url || resource.url
  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
        {(() => {
          const safe = embedUrl || ''
          if (typeof window !== 'undefined' && safe.includes('http')) {
            return (
              <iframe
                key={safe}
                src={safe}
                title={resource.title || title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full"
                loading="lazy"
              />
            )
          }
          return null
        })()}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="secondary" className="text-[10px] capitalize">{resource.provider || 'video'}</Badge>
        {resource.license && (
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            <span className="max-w-[280px] truncate">{resource.license}</span>
          </span>
        )}
        {resource.duration ? <span>{formatDuration(resource.duration)}</span> : null}
        {resource.url && (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Watch on {resource.provider}
          </a>
        )}
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const resolved = use(params)
  const courseId = resolved.id

  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`/api/learning/courses/${encodeURIComponent(courseId)}`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed')
        const json = await res.json()
        if (!active) return
        if (json.data) {
          setCourse(json.data)
        } else {
          // Fallback: try the main courses list
          const listRes = await fetch('/api/learning/courses', { credentials: 'include' })
          if (listRes.ok) {
            const listJson = await listRes.json()
            const found = (listJson.data || []).find((c: Course) => c.id === courseId)
            if (found) setCourse(found)
          }
        }
      } catch {
        if (active) setCourse(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [courseId])

  if (!gate.ready) return null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="space-y-4">
        <Card className="p-8 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Course not found.</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/learning">Back to Learning</Link>
          </Button>
        </Card>
      </div>
    )
  }

  const totalLessons = course.sections?.reduce((acc, s) => acc + s.lessons.length, 0) || 0

  const allLessons = (course.sections || []).flatMap((s) => s.lessons)
  const activeLesson = allLessons.find((l) => l.id === activeId) || allLessons[0]
  const activeResource =
    activeLesson?.resources?.find((r) => r.embed_url) ||
    activeLesson?.resources?.[0] ||
    (activeLesson?.url || course.source_url
      ? { title: activeLesson?.title, url: activeLesson?.url || course.source_url, provider: course.source, playback_type: 'external' }
      : null)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">{course.title}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="capitalize">{course.level}</Badge>
          <Badge variant="secondary">{course.type}</Badge>
          <Badge variant="outline" className="text-xs">
            <ExternalLink className="h-3 w-3 mr-1" />
            {course.source}
          </Badge>
          <span className="text-xs text-muted-foreground self-center">{totalLessons} lessons</span>
        </div>
        <p className="text-sm text-muted-foreground">{course.description}</p>
      </div>

      {/* Active lesson player */}
      {activeLesson && activeResource && (
        <Card className="border-border/60 overflow-hidden">
          <div className="p-4 border-b border-border/40 space-y-2">
            <div className="flex items-center gap-2">
              <MonitorPlay className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-foreground">{activeLesson.title}</h2>
            </div>
            {activeLesson.description && (
              <p className="text-xs text-muted-foreground">{activeLesson.description}</p>
            )}
          </div>
          <div className="p-4">
            <EmbedPlayer resource={activeResource} title={activeLesson.title} />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sections & Lessons */}
        <div className="lg:col-span-3 space-y-4">
          {course.sections?.map((section) => (
            <Card key={section.slug} className="border-border/60">
              <div className="p-4 border-b border-border/40">
                <h2 className="font-semibold text-foreground">{section.title}</h2>
              </div>
              <div className="divide-y divide-border/40">
                {section.lessons?.map((lesson) => {
                  const isActive = lesson.id === activeLesson?.id
                  const hasEmbed = (lesson.resources || []).some((r) => r.embed_url)
                  return (
                    <button
                      key={lesson.slug}
                      onClick={() => setActiveId(lesson.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        isActive ? 'bg-primary/5' : 'hover:bg-muted/30'
                      }`}
                    >
                      {hasEmbed ? (
                        <MonitorPlay className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <Play className="h-4 w-4 text-primary shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${isActive ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                          {lesson.title}
                        </p>
                        {lesson.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{lesson.description}</p>
                        )}
                      </div>
                      {lesson.url && (
                        <a
                          href={lesson.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <CheckCircle
                        className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground/30'}`}
                      />
                    </button>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h3 className="font-bold text-foreground">About This Course</h3>
            <div className="text-xs text-muted-foreground space-y-2">
              <p><strong>Source:</strong> {course.source}</p>
              <p><strong>Level:</strong> {course.level}</p>
              <p><strong>License:</strong> {course.license}</p>
              <p><strong>Rating:</strong> {course.rating}/5</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {course.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </div>
          </Card>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/dashboard/learning">Back to Learning</Link>
          </Button>
          <Button className="w-full" asChild>
            <a href={course.source_url} target="_blank" rel="noopener noreferrer">
              Start on {course.source}
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

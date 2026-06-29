'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Play, BookOpen, Volume2, Zap, Star, Clock, Loader } from 'lucide-react'
import { parseLearningParams } from '@/lib/learning-query'

interface Course {
  id: string
  title: string
  description: string
  type: 'video' | 'audio' | 'text'
  instructor: string
  duration: string
  level: 'beginner' | 'intermediate' | 'advanced'
  enrolled: number
  rating: number
  progress?: number
  tags: string[]
}

function LearningPageInner() {
  const searchParams = useSearchParams()
  const { view, level, type } = useMemo(() => parseLearningParams(searchParams), [searchParams])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/courses')
      .then(r => r.json())
      .then(json => { if (json.data) setCourses(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filteredCourses = courses.filter((course) => {
    const levelMatch = level === 'all' || course.level === level
    const typeMatch = type === 'all' || course.type === type
    const viewMatch =
      view === 'all' ||
      (view === 'my-courses' && course.progress !== undefined) ||
      (view === 'all-courses')
    return levelMatch && typeMatch && viewMatch
  })

  const typeIcon = (t: Course['type']) => {
    if (t === 'video') return <Play className="h-4 w-4" />
    if (t === 'audio') return <Volume2 className="h-4 w-4" />
    return <BookOpen className="h-4 w-4" />
  }

  const levelBadge = (l: Course['level']) => {
    if (l === 'advanced') return 'border-amber-500/40 bg-amber-500/10 text-amber-700'
    if (l === 'intermediate') return 'border-primary/40 bg-primary/10 text-primary'
    return 'border-border bg-muted text-muted-foreground'
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Learning</h1>
        <p className="text-muted-foreground mt-1">Courses and tutorials to build your skills</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : courses.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No courses available yet. Check back soon for new content.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCourses.map((course) => (
            <Card key={course.id} className="border-border/60 p-5 transition-colors hover:border-primary/40">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  {typeIcon(course.type)}
                  <span className="text-xs font-medium capitalize">{course.type}</span>
                </div>
                <Badge variant="outline" className={`text-[10px] font-normal ${levelBadge(course.level)}`}>
                  {course.level}
                </Badge>
              </div>
              <h3 className="mb-1 font-semibold text-foreground">{course.title}</h3>
              <p className="mb-4 line-clamp-2 text-xs text-muted-foreground">{course.description}</p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {course.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                ))}
              </div>
              <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{course.instructor}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{course.duration}</span>
                <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{course.rating}</span>
              </div>
              {course.progress !== undefined && (
                <div className="mb-3">
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${course.progress}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{course.progress}% complete</p>
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full">
                {course.progress ? 'Continue' : 'Start'} Course
              </Button>
            </Card>
          ))}
        </div>
      )}

      {!loading && filteredCourses.length === 0 && courses.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">No courses match your filters.</p>
      )}
    </div>
  )
}

export default function LearningPage() {
  return (
    <Suspense>
      <LearningPageInner />
    </Suspense>
  )
}

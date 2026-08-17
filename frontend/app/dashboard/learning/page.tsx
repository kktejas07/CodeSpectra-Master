'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Flame, Zap, BookOpen, Volume2, Play, Star, Clock, Loader, Trophy, ArrowRight, HelpCircle, CheckCircle2, TrendingUp, Target, Layers, Loader2, RefreshCw } from 'lucide-react'
import { HUNDRED_DAYS } from '@/lib/100-days-data'
import { usePageGuard } from '@/lib/use-page-guard'

const HUNDRED_DAYS_TOTAL_DAYS = 100

interface Track {
  id: string
  name: string
  description: string
  topics: string[]
  tone: string
  badge?: string
}

interface Course {
  id: string
  title: string
  description: string
  type: 'video' | 'audio' | 'text'
  instructor: string
  duration: string
  level: 'beginner' | 'intermediate' | 'advanced'
  rating: number
  progress?: number
  tags: string[]
}

const COURSE_TYPE_ICON: Record<Course['type'], React.ReactNode> = {
  video: <Play className="h-4 w-4" />,
  audio: <Volume2 className="h-4 w-4" />,
  text: <BookOpen className="h-4 w-4" />,
}

const LEVEL_STYLE: Record<Course['level'], string> = {
  advanced: 'border-amber-500/40 bg-amber-500/10 text-amber-700',
  intermediate: 'border-primary/40 bg-primary/10 text-primary',
  beginner: 'border-border bg-muted text-muted-foreground',
}

function HundredDaysHero() {
  const [completed, setCompleted] = useState<number[]>([])
  const [problemsDone, setProblemsDone] = useState<number>(0)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('100-days-completed')
      setCompleted(raw ? JSON.parse(raw) : [])
    } catch { setCompleted([]) }

    let total = 0
    try {
      for (let d = 1; d <= 100; d++) {
        const dayRaw = localStorage.getItem(`100-days-d${d}-completed`)
        if (dayRaw) {
          const arr = JSON.parse(dayRaw)
          if (Array.isArray(arr)) total += arr.length
        }
      }
    } catch { /* ignore */ }
    setProblemsDone(total)
  }, [])

  const totalProblems = HUNDRED_DAYS.reduce((acc, d) => acc + d.problems.length, 0)
  const daysCompleted = new Set(completed).size
  const pct = Math.round((daysCompleted / HUNDRED_DAYS_TOTAL_DAYS) * 100)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-6">
      <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -left-6 -bottom-6 h-24 w-24 rounded-full bg-primary/5 blur-3xl" />
      <div className="relative">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
              <Flame className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">100 Days of Code</h2>
              <p className="text-sm text-muted-foreground">{totalProblems} problems · 26 languages · Interview prep</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {['Basics', 'Arrays', 'Strings', 'Stacks', 'Trees', 'DP'].map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Days done" value={`${daysCompleted}/${HUNDRED_DAYS_TOTAL_DAYS}`} />
          <Stat label="Problems" value={`${problemsDone}`} suffix={`/${totalProblems}`} />
          <Stat label="Progress" value={`${pct}%`} />
          <Stat label="Topics" value={`${HUNDRED_DAYS.length}+`} />
        </div>

        <div className="h-2 w-full rounded-full bg-muted mb-4 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        <Link href="/dashboard/100-days">
          <Button className="gap-2">
            <Target className="h-4 w-4" />
            {daysCompleted > 0 ? 'Continue Day' : 'Start Day 1'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <div className="text-lg font-bold tabular-nums">
        {value}<span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function TracksSection() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tracks')
      .then((r) => r.json())
      .then((j) => { if (j.data) setTracks(j.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const TRACK_COLORS: Record<string, string> = {
    python: 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15',
    javascript: 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15',
    dsa: 'border-primary/40 bg-primary/10 hover:bg-primary/15',
    react: 'border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/15',
    node: 'border-green-500/40 bg-green-500/10 hover:bg-green-500/15',
    sql: 'border-fuchsia-500/40 bg-fuchsia-500/10 hover:bg-fuchsia-500/15',
    java: 'border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/15',
    cpp: 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15',
    system_design: 'border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/15',
  }

  const TRACK_ICONS: Record<string, React.ReactNode> = {
    python: <Zap className="h-5 w-5 text-emerald-500" />,
    javascript: <Zap className="h-5 w-5 text-amber-500" />,
    dsa: <Layers className="h-5 w-5 text-primary" />,
    react: <Zap className="h-5 w-5 text-cyan-500" />,
    node: <Zap className="h-5 w-5 text-green-500" />,
    sql: <Zap className="h-5 w-5 text-fuchsia-500" />,
    java: <Zap className="h-5 w-5 text-orange-500" />,
    cpp: <Zap className="h-5 w-5 text-rose-500" />,
    system_design: <TrendingUp className="h-5 w-5 text-indigo-500" />,
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold">Skill Tracks</h2>
        <Badge variant="secondary" className="text-xs">{tracks.length} tracks</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tracks.map((track) => {
          const tone = TRACK_COLORS[track.id] || 'border-border bg-card hover:bg-muted/50'
          return (
            <Link
              key={track.id}
              href={`/dashboard/problems?topics=${encodeURIComponent(track.topics.join(','))}`}
              className="block"
            >
              <Card className={`p-5 border transition-colors ${tone}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    {TRACK_ICONS[track.id] || <Zap className="h-5 w-5 text-primary" />}
                    <h3 className="font-semibold text-sm">{track.name}</h3>
                  </div>
                  {track.badge && (
                    <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                      {track.badge}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{track.description}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {track.topics.slice(0, 4).map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                  {track.topics.length > 4 && (
                    <Badge variant="secondary" className="text-[10px]">+{track.topics.length - 4}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-primary">
                  <Trophy className="h-3 w-3" />
                  <span>Solve problems</span>
                  <ArrowRight className="h-3 w-3 ml-auto" />
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function CoursesSection() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/learning/courses')
      .then((r) => r.json())
      .then((j) => { if (j.data) setCourses(j.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Also fetch courses from the legacy API for backward compatibility
  useEffect(() => {
    fetch('/api/courses')
      .then((r) => r.json())
      .then((j) => { if (j.data && j.data.length > 0) setCourses(j.data) })
      .catch(() => {})
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (courses.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold">Courses & Guides</h2>
        <Badge variant="secondary" className="text-xs">{courses.length} resources</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <Card key={course.id} className="border-border/60 p-5 transition-colors hover:border-primary/40">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                {COURSE_TYPE_ICON[course.type]}
                <span className="text-xs font-medium capitalize">{course.type}</span>
              </div>
              <Badge variant="outline" className={`text-[10px] font-normal ${LEVEL_STYLE[course.level]}`}>
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
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href={`/dashboard/learning/${course.id}`}>
                {course.progress ? 'Continue' : 'Start'} Course
              </Link>
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}

function LearningPageInner() {
  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold text-foreground">Learning</h1>
          <Badge variant="outline" className="text-xs text-muted-foreground">Curriculum hub</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Active coding tracks, structured curricula, and courses — all in one place.
        </p>
      </div>

      <HundredDaysHero />
      <TracksSection />
      <CoursesSection />
    </div>
  )
}

export default function LearningPage() {
  const gate = usePageGuard('user')
  if (!gate.ready) return null

  return (
    <Suspense>
      <LearningPageInner />
    </Suspense>
  )
}
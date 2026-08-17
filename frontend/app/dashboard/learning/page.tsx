'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Flame, Zap, BookOpen, Volume2, Play, Star, Clock, Loader, Trophy, ArrowRight, Target, Layers, Loader2, Search, ExternalLink, GraduationCap, Video, ListTree, TrendingUp } from 'lucide-react'
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

interface VideoResource {
  title: string
  description: string
  provider: string
  provider_video_id: string
  embed_url: string
  source_url: string
  thumbnail: string
  duration: number
  language: string
  license: string
  author: string
  playback_type: string
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

const LEVELS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All levels' },
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]

const TYPES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All types' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Text' },
]

const VIEWS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'curriculums', label: 'Curriculums' },
  { id: 'videos', label: 'Videos' },
  { id: 'tracks', label: 'Skill Tracks' },
]

const DEFAULT_VIDEO_QUERIES = [
  'Python for beginners',
  'JavaScript crash course',
  'Data structures and algorithms',
  'System design fundamentals',
  'SQL tutorial',
  'React hooks tutorial',
]

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

function TracksSection({ hidden }: { hidden: boolean }) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tracks')
      .then((r) => r.json())
      .then((j) => { if (j.data) setTracks(j.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (hidden || loading) {
    if (hidden) return null
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

function CoursesSection({ hidden, level, type }: { hidden: boolean; level: string; type: string }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/learning/courses', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (j.data) setCourses(j.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (hidden) return null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (courses.length === 0) return null

  const filtered = courses.filter((c) => {
    const levelOk = level === 'all' || (c.level || '').toLowerCase() === level
    const typeOk = type === 'all' || (c.type || '').toLowerCase() === type
    return levelOk && typeOk
  })

  if (filtered.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold">Curriculums</h2>
        <Badge variant="secondary" className="text-xs">{filtered.length} resources</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((course) => (
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
              {(course.tags || []).map((tag) => (
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

function formatDuration(sec: number): string {
  if (!sec) return ''
  const m = Math.round(sec / 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m}m`
}

function VideosSection({ hidden, query, onQuery }: { hidden: boolean; query: string; onQuery: (q: string) => void }) {
  const [videos, setVideos] = useState<VideoResource[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [input, setInput] = useState(query)

  useEffect(() => {
    setInput(query)
  }, [query])

  useEffect(() => {
    if (hidden || !query.trim()) return
    let cancelled = false
    setLoading(true)
    setError('')
    setVideos(null)
    fetch(`/api/learning/videos?q=${encodeURIComponent(query)}&limit=8`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (!j.ok) { setError(j.error || 'Video search failed'); return }
        setVideos(j.results || [])
      })
      .catch(() => { if (!cancelled) setError('Failed to load videos') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [hidden, query])

  if (hidden) return null

  const submit = () => {
    const q = input.trim()
    if (!q) return
    onQuery(q)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold">Free Videos</h2>
        <Badge variant="secondary" className="text-xs">Open licensed & YouTube</Badge>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search free coding videos…"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="max-w-md"
        />
        <Button onClick={submit} disabled={loading} variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {DEFAULT_VIDEO_QUERIES.map((q) => (
          <button
            key={q}
            onClick={() => onQuery(q)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${query === q ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}
          >
            {q}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 text-sm text-destructive bg-destructive/5 border border-destructive/30 rounded-lg px-3 py-2">{error}</p>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {videos && videos.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No videos found for “{query}”. Try a different search.
        </div>
      )}

      {videos && videos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {videos.map((v, i) => (
            <Card key={`${v.provider}-${v.provider_video_id}-${i}`} className="border-border/60 overflow-hidden transition-colors hover:border-primary/40">
              {v.thumbnail ? (
                <div className="relative aspect-video w-full overflow-hidden bg-muted">
                  <img src={v.thumbnail} alt={v.title} className="h-full w-full object-cover" loading="lazy" />
                  {v.duration > 0 && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {formatDuration(v.duration)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-muted">
                  <Video className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px]">{v.provider}</Badge>
                  {v.language && <span className="text-[10px] text-muted-foreground">{v.language}</span>}
                </div>
                <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-foreground">{v.title}</h3>
                <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{v.description || v.license}</p>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <GraduationCap className="h-3 w-3 shrink-0" />
                    <span className="truncate">{v.author || v.provider}</span>
                  </span>
                  <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs" asChild>
                    <a href={v.source_url || v.embed_url} target="_blank" rel="noopener noreferrer">
                      Watch <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function LearningPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const view = searchParams.get('view') || 'all'
  const level = searchParams.get('level') || 'all'
  const type = searchParams.get('type') || 'all'
  const videoQuery = searchParams.get('q') || 'Python for beginners'

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all' || value === '') params.delete(key)
    else params.set(key, value)
    router.replace(`/dashboard/learning${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }

  const showHero = view === 'all' || view === 'curriculums'
  const showTracks = view === 'all' || view === 'tracks'
  const showCourses = view === 'all' || view === 'curriculums'
  const showVideos = view === 'all' || view === 'videos'

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-foreground">Learning</h1>
            <Badge variant="outline" className="text-xs text-muted-foreground">Curriculum hub</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Active coding tracks, structured curricula, and free videos — all in one place.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setParam('view', v.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${view === v.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}
            >
              {v.id === 'curriculums' && <ListTree className="h-3.5 w-3.5" />}
              {v.id === 'videos' && <Video className="h-3.5 w-3.5" />}
              {v.id === 'tracks' && <Layers className="h-3.5 w-3.5" />}
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => setParam('level', l.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${level === l.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setParam('type', t.id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${type === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}
            >
              {COURSE_TYPE_ICON[t.id as Course['type']] || null}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {showHero && <HundredDaysHero />}
      {showTracks && <TracksSection hidden={!showTracks} />}
      {showCourses && <CoursesSection hidden={!showCourses} level={level} type={type} />}
      {showVideos && <VideosSection hidden={!showVideos} query={videoQuery} onQuery={(q) => setParam('q', q)} />}
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

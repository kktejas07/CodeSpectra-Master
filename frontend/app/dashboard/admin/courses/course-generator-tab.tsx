'use client'
import { formatTime } from '@/lib/format-datetime'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/app/page-kit'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2, Clock, Pause,
  RotateCcw, Trash2, Eye, ChevronDown, ChevronUp, Zap, BookOpen,
  RefreshCw, BarChart3, RotateCw, Film, CheckCircle2, Circle,
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { estimateCatalog, estimateCourse, COURSE_LEVELS, INDUSTRIES, subjectsForIndustry } from '@/lib/courses/syllabus'
import { EmptyState } from '@/components/ui/empty-state'

interface JobLog {
  timestamp: string
  message: string
  type: 'info' | 'success' | 'error' | 'warning'
}

interface GenerationJob {
  id: string
  courseId: string
  courseTitle: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  totalItems: number
  completedItems: number
  failedItems: number
  targetMinutes?: number
  logs: JobLog[]
  startedAt: string
  completedAt?: string
  error?: string
}

const LEVELS = [...COURSE_LEVELS]

/** Count lessons that have a playable MP4 (`videoUrl`) vs script-only stubs. */
function courseMediaStats(course: any) {
  const lessons = (course.sections || []).flatMap((s: any) => s.lessons || [])
  const total = lessons.length
  const mp4Ready = lessons.filter((l: any) => Boolean(l.videoUrl)).length
  const scriptOnly = lessons.filter((l: any) => !l.videoUrl && Array.isArray(l.script) && l.script.length > 0).length
  return { total, mp4Ready, scriptOnly, pending: Math.max(0, total - mp4Ready) }
}

export default function CourseGeneratorTab() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  // Form state
  const [technology, setTechnology] = useState('')
  const [level, setLevel] = useState('')
  const [customTech, setCustomTech] = useState('')
  const [industry, setIndustry] = useState<(typeof INDUSTRIES)[number]['id']>('software')
  const [targetMinutes, setTargetMinutes] = useState(10)

  // Job state
  const [jobs, setJobs] = useState<GenerationJob[]>([])
  const [generating, setGenerating] = useState(false)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null)
  const [workerHint, setWorkerHint] = useState('')
  const [workerStuck, setWorkerStuck] = useState(false)
  const [runningJobTitle, setRunningJobTitle] = useState('')

  // Course state
  const [existingCourses, setExistingCourses] = useState<any[]>([])
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null)

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState('')
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

  // Live LLM chain health (cached probe doc — instant, refreshed via Test-all in settings)
  const [llmHealth, setLlmHealth] = useState<{ working: number; total: number; checkedAt: string | null } | null>(null)
  const loadLlmHealth = async () => {
    try {
      const res = await csrfFetch('/api/admin/llm-health', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      const results = Array.isArray(data.results) ? data.results : []
      setLlmHealth({
        working: results.filter((r: any) => r.status === 'ok').length,
        total: results.length,
        checkedAt: data.checkedAt ?? null,
      })
    } catch {
      setLlmHealth(null)
    }
  }

  // Load data
  useEffect(() => {
    loadJobs()
    loadExistingCourses()
    loadWorker()
    void loadLlmHealth()
    const interval = setInterval(() => {
      loadJobs()
      loadWorker()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadJobs = async () => {
    try {
      const res = await csrfFetch('/api/admin/courses/jobs', { credentials: 'include' })
      const data = await res.json()
      if (data.jobs) setJobs(data.jobs)
    } catch {}
  }

  const loadWorker = async () => {
    try {
      const res = await csrfFetch('/api/admin/courses/worker', { credentials: 'include' })
      const data = await res.json()
      if (typeof data.online === 'boolean') setWorkerOnline(data.online)
      if (data.hint) setWorkerHint(data.hint)
      setWorkerStuck(Boolean(data.stuck))
      setRunningJobTitle(data.runningJob?.courseTitle ? `${data.runningJob.courseTitle} (${data.runningJob.progress || 0}%)` : '')
    } catch {
      setWorkerOnline(false)
    }
  }

  const handleUnstick = async () => {
    try {
      const res = await csrfFetch('/api/admin/courses/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'unstick' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unstick failed')
      addToast({ type: 'success', title: data.message || 'Stuck job requeued' })
      loadJobs()
      loadWorker()
    } catch (err: any) {
      addToast({ type: 'error', title: err.message })
    }
  }

  const handleRetryJob = async (jobId: string, e: React.MouseEvent, regenerateAll = false) => {
    e.stopPropagation()
    try {
      const res = await csrfFetch('/api/admin/courses/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId, action: 'retry', regenerateAll }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Retry failed')
      addToast({ type: 'success', title: data.message || 'Job requeued' })
      loadJobs()
      loadWorker()
    } catch (err: any) {
      addToast({ type: 'error', title: err.message })
    }
  }

  const handleRegenerateAllJob = (jobId: string, courseTitle: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmTitle('Regenerate all videos')
    setConfirmMessage(`Delete existing videos for "${courseTitle}" (including successful ones) and generate all lessons again?`)
    setConfirmAction(() => async () => {
      await handleRetryJob(jobId, e, true)
    })
    setConfirmOpen(true)
  }

  const handleCancelJob = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await csrfFetch('/api/admin/courses/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId, action: 'cancel' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Cancel failed')
      addToast({ type: 'success', title: 'Job cancelled' })
      loadJobs()
    } catch (err: any) {
      addToast({ type: 'error', title: err.message })
    }
  }

  const loadExistingCourses = async () => {
    try {
      const res = await csrfFetch('/api/admin/courses', { credentials: 'include' })
      const data = await res.json()
      if (data.data) setExistingCourses(data.data)
    } catch {}
  }

  const selectedTech = customTech || technology
  const industrySubjects = subjectsForIndustry(industry)
  const preview = selectedTech && level ? estimateCourse(selectedTech, level) : null
  const catalog = estimateCatalog()
  const industryCatalog = estimateCatalog(industrySubjects.map(s => s.name), LEVELS)

  // Start generation (server-side worker)
  const handleGenerate = async () => {
    if (!selectedTech || !level) {
      addToast({ type: 'error', title: 'Select subject and level' })
      return
    }

    setGenerating(true)
    try {
      // Step 1: Generate curriculum
      addToast({ type: 'info', title: 'Creating course...' })
      const currRes = await csrfFetch('/api/admin/courses/generate-curriculum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ techStack: selectedTech, level }),
      })
      const currData = await currRes.json().catch(() => ({}))
      if (currRes.status === 409) {
        throw new Error(currData.error || 'Course already exists — delete it or regenerate videos on the existing course.')
      }
      if (!currRes.ok) throw new Error(currData.error || 'Curriculum generation failed')

      const courseId = currData.course?.id || selectedTech.toLowerCase().replace(/\s+/g, '-')
      const totalLessons = currData.totalLessons || 0

      addToast({ type: 'success', title: `Course created: ${currData.course?.title}` })

      // Step 2: Create job
      const jobRes = await csrfFetch('/api/admin/courses/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          courseId,
          courseTitle: currData.course?.title || selectedTech,
          type: 'video',
          totalItems: totalLessons,
          targetMinutes,
        }),
      })
      const jobData = await jobRes.json()
      if (!jobRes.ok) throw new Error(jobData.error || 'Failed to queue video job')

      addToast({ type: 'success', title: 'Queued — course worker will generate videos (one job at a time)' })
      loadJobs()
      loadExistingCourses()
    } catch (e: any) {
      addToast({ type: 'error', title: e.message })
    } finally {
      setGenerating(false)
    }
  }

  // Regenerate videos for a course
  const handleRegenerate = async (courseId: string, courseTitle: string) => {
    try {
      // Create new job
      const course = existingCourses.find(c => c.id === courseId)
      const totalLessons = course?.sections?.reduce((sum: number, s: any) => sum + (s.lessons?.length || 0), 0) || 0

      const jobRes = await csrfFetch('/api/admin/courses/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          courseId,
          courseTitle,
          type: 'video',
          totalItems: totalLessons,
          force: true,
          targetMinutes,
        }),
      })
      const jobData = await jobRes.json()
      if (!jobRes.ok) throw new Error(jobData.error || 'Failed to queue regeneration')

      addToast({ type: 'success', title: `Queued regeneration for "${courseTitle}"` })
      loadJobs()
    } catch (e: any) {
      addToast({ type: 'error', title: e.message })
    }
  }

  // Delete course
  const handleDeleteCourse = (courseId: string, title: string) => {
    setConfirmTitle('Delete course')
    setConfirmMessage(`Delete "${title}"? This action cannot be undone. All videos, quizzes, and progress will be permanently removed.`)
    setConfirmAction(() => async () => {
      try {
        await csrfFetch(`/api/admin/courses/${courseId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        setExistingCourses(existingCourses.filter(c => c.id !== courseId))
        addToast({ type: 'success', title: `Deleted "${title}"` })
      } catch (e: any) {
        addToast({ type: 'error', title: e.message })
      }
    })
    setConfirmOpen(true)
  }

  // Delete job
  const handleDeleteFailedJobs = () => {
    setConfirmTitle('Delete failed jobs')
    setConfirmMessage('Delete all failed and cancelled job records? Running jobs are kept.')
    setConfirmAction(() => async () => {
      try {
        const res = await csrfFetch('/api/admin/courses/jobs?failed=1', {
          method: 'DELETE',
          credentials: 'include',
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Delete failed')
        addToast({ type: 'success', title: `Deleted ${data.deleted ?? 0} jobs` })
        loadJobs()
      } catch (err: any) {
        addToast({ type: 'error', title: err.message })
      }
    })
    setConfirmOpen(true)
  }

  const handleDeleteJob = (jobId: string) => {
    setConfirmTitle('Delete job')
    setConfirmMessage('Delete this job record? This cannot be undone.')
    setConfirmAction(() => async () => {
      try {
        await csrfFetch(`/api/admin/courses/jobs?jobId=${jobId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        setJobs(jobs.filter(j => j.id !== jobId))
        addToast({ type: 'success', title: 'Job deleted' })
      } catch {}
    })
    setConfirmOpen(true)
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      running: 'bg-primary/10 text-primary border-primary/20',
      completed: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20',
      failed: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
      cancelled: 'bg-muted text-muted-foreground border-border',
    }
    return (
      <Badge variant="outline" className={`text-xs capitalize ${styles[status] || styles.pending}`}>
        {status}
      </Badge>
    )
  }

  if (!gate.ready) return null

  const runningJobs = jobs.filter(j => j.status === 'running' || j.status === 'pending')
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed')

  const llmStrip = (() => {
    const link = (
      <Link href="/dashboard/admin/settings?section=llm" className="underline underline-offset-2 hover:text-foreground shrink-0">
        AI &amp; LLM Keys → Health
      </Link>
    )
    if (!llmHealth) {
      return { dot: 'bg-muted-foreground', text: 'LLM chain: checking…', tone: 'text-muted-foreground', link }
    }
    if (llmHealth.total === 0 || !llmHealth.checkedAt) {
      return { dot: 'bg-amber-500', text: 'LLM providers not tested yet — generation may fail. Run “Test all providers” in settings.', tone: 'text-amber-700 dark:text-amber-300', link }
    }
    if (llmHealth.working === 0) {
      return { dot: 'bg-red-500', text: `LLM chain down (0/${llmHealth.total} working) — generation will fail. Fix a provider first.`, tone: 'text-red-700 dark:text-red-300', link }
    }
    if (llmHealth.working < llmHealth.total) {
      return { dot: 'bg-amber-500', text: `LLM chain degraded (${llmHealth.working}/${llmHealth.total} working) — fallback covers the gaps.`, tone: 'text-amber-700 dark:text-amber-300', link }
    }
    return { dot: 'bg-green-500', text: `LLM chain healthy (${llmHealth.working}/${llmHealth.total} providers working)`, tone: 'text-green-700 dark:text-green-300', link }
  })()

  return (
    <div className="space-y-6">
      {/* LLM chain status — cached probe, refreshes via Test-all in settings */}
      <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-4 py-2.5 text-xs">
        <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${llmStrip.dot}`} />
        <span className={`truncate flex-1 ${llmStrip.tone}`}>{llmStrip.text}</span>
        {llmStrip.link}
        <button
          type="button"
          onClick={() => { void loadLlmHealth(); loadWorker() }}
          className="text-muted-foreground hover:text-foreground shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Refresh status"
          aria-label="Refresh status"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Generation Form */}
        <div className="lg:col-span-1 space-y-4">
          <Panel className="p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              New course
            </h2>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Industry</label>
              <select
                value={industry}
                onChange={e => {
                  setIndustry(e.target.value as (typeof INDUSTRIES)[number]['id'])
                  setTechnology('')
                  setCustomTech('')
                }}
                className="w-full rounded-lg border border-border bg-background px-3 h-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {INDUSTRIES.map(ind => <option key={ind.id} value={ind.id}>{ind.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Subject</label>
              <select value={technology} onChange={e => { setTechnology(e.target.value); setCustomTech('') }} className="w-full rounded-lg border border-border bg-background px-3 h-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Select subject</option>
                {industrySubjects.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <input type="text" value={customTech} onChange={e => setCustomTech(e.target.value)} placeholder="Or type a custom subject..." className="w-full rounded-lg border border-border bg-background px-3 h-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-2" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Level</label>
              <select value={level} onChange={e => setLevel(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 h-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Select level</option>
                {LEVELS.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Lesson length</label>
              <select value={targetMinutes} onChange={e => setTargetMinutes(Number(e.target.value) || 10)} className="w-full rounded-lg border border-border bg-background px-3 h-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value={10}>~10 min / lesson (15 slides)</option>
                <option value={15}>~15 min / lesson (22 slides)</option>
                <option value={30}>~30 min / lesson (40 slides)</option>
                <option value={60}>~60 min / lesson (60 slides)</option>
              </select>
            </div>

            <Button onClick={handleGenerate} disabled={generating || !selectedTech || !level} className="w-full gap-2">
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Zap className="h-4 w-4" /> Generate course</>}
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Full syllabus + curriculum for this subject/level, then MP4, audio, and captions (~{targetMinutes} min/lesson, one job at a time).
            </p>
            {preview && (
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 space-y-2">
                <p className="text-sm font-medium">{preview.title}</p>
                <p className="text-[11px] text-muted-foreground">{preview.brief}</p>
                <p className="text-[11px] text-muted-foreground">
                  {preview.industry} · {preview.moduleCount} modules · ≥{preview.minLessons} lessons · ~{preview.estimatedHours} hours
                </p>
                <ol className="list-decimal pl-4 max-h-40 overflow-y-auto space-y-0.5 text-[11px] text-muted-foreground">
                  {preview.modules.map(m => <li key={m}>{m}</li>)}
                </ol>
              </div>
            )}
          </Panel>

          {/* Stats Card */}
          <Panel className="p-5 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Worker
            </h2>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${workerOnline ? 'bg-green-500' : workerOnline === false ? 'bg-red-500' : 'bg-muted-foreground'}`} />
              <span className="text-sm font-medium">
                {workerOnline === null ? 'Checking…' : workerOnline ? 'Online — jobs start automatically' : 'Offline'}
              </span>
            </div>
            {runningJobTitle && (
              <p className="text-[11px] text-muted-foreground">Running: {runningJobTitle}</p>
            )}
            {workerHint && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">{workerHint}</p>
            )}
            <Button variant="outline" size="sm" className="w-full" onClick={handleUnstick}>
              Unstick hung job
            </Button>
            {workerStuck && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">Job is marked running but the worker is idle. Unstick requeues it.</p>
            )}
          </Panel>

          {/* Stats Card */}
          <Panel className="p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-primary" />
              Quick stats
            </h2>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-muted/40">
                <p className="text-lg font-bold tabular-nums">{existingCourses.length}</p>
                <p className="text-[11px] text-muted-foreground">Courses</p>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40">
                <p className="text-lg font-bold tabular-nums">{jobs.length}</p>
                <p className="text-[11px] text-muted-foreground">Jobs</p>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40">
                <p className="text-lg font-bold tabular-nums text-green-700 dark:text-green-400">{completedJobs.filter(j => j.status === 'completed').length}</p>
                <p className="text-[11px] text-muted-foreground">Completed</p>
              </div>
              <div className="p-2.5 rounded-xl bg-muted/40">
                <p className="text-lg font-bold tabular-nums text-primary">{runningJobs.length}</p>
                <p className="text-[11px] text-muted-foreground">Running</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              This industry: <strong>{industryCatalog.courses} courses</strong>, ~{industryCatalog.lessons.toLocaleString()} lessons, ~{industryCatalog.hours}h, ~{industryCatalog.gb} GB.
              Full catalog ({catalog.industries} industries, {catalog.subjects} subjects): <strong>{catalog.courses} courses</strong>, ~{catalog.lessons.toLocaleString()} lessons, ~{catalog.hours}h, ~{catalog.gb} GB.
            </p>
          </Panel>
        </div>

        {/* Right: Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="courses" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="courses" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Courses ({existingCourses.length})
              </TabsTrigger>
              <TabsTrigger value="jobs" className="gap-2">
                <Clock className="h-4 w-4" />
                Jobs ({jobs.length})
              </TabsTrigger>
            </TabsList>

            {/* Courses Tab */}
            <TabsContent value="courses" className="mt-4">
              <Panel className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold">Existing courses</h2>
                  <Button variant="ghost" size="sm" onClick={loadExistingCourses} aria-label="Refresh courses">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {existingCourses.length === 0 ? (
                  <EmptyState variant="courses" title="No courses yet" description="Pick an industry, subject and level, then select Generate course." className="border-0 bg-transparent py-6 md:py-8" />
                ) : (
                  <div className="space-y-2">
                    {existingCourses.map((course: any) => {
                      const media = courseMediaStats(course)
                      const open = expandedCourse === course.id
                      const sections = course.sections || []

                      return (
                        <div key={course.id} className="rounded-2xl border border-border/60 overflow-hidden">
                          <div className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                          <button type="button" className="flex items-center gap-3 text-left min-w-0" onClick={() => setExpandedCourse(open ? null : course.id)}>
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                              <Film className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{course.title}</p>
                              <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span>{sections.length} modules · {media.total} lessons</span>
                                <Badge
                                  variant="outline"
                                  className={`h-5 px-1.5 text-[11px] font-normal tabular-nums ${
                                    media.mp4Ready === media.total && media.total > 0
                                      ? 'border-green-500/40 text-green-700 dark:text-green-300'
                                      : media.mp4Ready > 0
                                        ? 'border-amber-500/40 text-amber-700 dark:text-amber-300'
                                        : 'border-border text-muted-foreground'
                                  }`}
                                >
                                  MP4 {media.mp4Ready}/{media.total}
                                </Badge>
                                {media.pending > 0 && (
                                  <span className="text-amber-700 dark:text-amber-300">{media.pending} pending</span>
                                )}
                                {media.scriptOnly > 0 && media.mp4Ready === 0 && (
                                  <span className="text-muted-foreground">(script only — no MP4 yet)</span>
                                )}
                              </p>
                            </div>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => handleRegenerate(course.id, course.title)} title="Regenerate videos (force)" aria-label="Regenerate videos">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Open course" aria-label="Open course" asChild>
                              <Link href={`/dashboard/courses/${course.id}`}>
                                <Eye className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteCourse(course.id, course.title)} title="Delete course" aria-label="Delete course" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          </div>
                          {open && (
                            <div className="border-t border-border/50 px-3 py-2 max-h-64 overflow-y-auto space-y-3">
                              {sections.map((section: any) => (
                                <div key={section.id || section.title}>
                                  <p className="text-[11px] font-medium text-foreground/80 mb-1">{section.title}</p>
                                  <ul className="space-y-0.5">
                                    {(section.lessons || []).map((lesson: any) => {
                                      const hasMp4 = Boolean(lesson.videoUrl)
                                      return (
                                        <li key={lesson.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                          {hasMp4 ? (
                                            <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600 dark:text-green-400" />
                                          ) : (
                                            <Circle className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                                          )}
                                          <span className="truncate flex-1">{lesson.title}</span>
                                          <span className={hasMp4 ? 'text-green-700 dark:text-green-400 shrink-0' : 'shrink-0'}>
                                            {hasMp4 ? 'MP4' : '—'}
                                          </span>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Panel>
            </TabsContent>

            {/* Jobs Tab */}
            <TabsContent value="jobs" className="mt-4">
              <Panel className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold">Generation jobs</h2>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" title="Delete failed jobs" aria-label="Delete failed jobs" onClick={handleDeleteFailedJobs}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={loadJobs} aria-label="Refresh jobs">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {jobs.length === 0 ? (
                  <EmptyState variant="sessions" title="No jobs yet" description="Generate a course and its video job will appear here." className="border-0 bg-transparent py-6 md:py-8" />
                ) : (
                  <div className="space-y-3">
                    {jobs.map(job => (
                      <div key={job.id} className="border border-border/60 rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary" role="button" tabIndex={0} aria-expanded={expandedJob === job.id} onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedJob(expandedJob === job.id ? null : job.id) } }}>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={job.status} />
                            <div>
                              <p className="text-sm font-medium">{job.courseTitle}</p>
                              <p className="text-xs tabular-nums text-muted-foreground">
                                MP4 {job.completedItems}/{job.totalItems}
                                {job.failedItems > 0 && <span className="text-red-600 dark:text-red-400 ml-2">{job.failedItems} failed</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            {(job.status === 'failed' || job.status === 'cancelled' || job.status === 'running' || job.status === 'pending') && (
                              <Button variant="ghost" size="sm" title="Retry remaining lessons (keep successful videos)" aria-label="Retry remaining lessons" onClick={(e) => handleRetryJob(job.id, e)}>
                                <RotateCw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {(job.status === 'failed' || job.status === 'cancelled' || job.status === 'completed') && (
                              <Button variant="ghost" size="sm" title="Regenerate all videos from scratch" aria-label="Regenerate all videos" onClick={(e) => handleRegenerateAllJob(job.id, job.courseTitle, e)}>
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {(job.status === 'pending' || job.status === 'running') && (
                              <Button variant="ghost" size="sm" title="Cancel job" aria-label="Cancel job" onClick={(e) => handleCancelJob(job.id, e)}>
                                <Pause className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {job.status !== 'running' && (
                              <Button variant="ghost" size="sm" title="Delete job" aria-label="Delete job" className="text-destructive hover:text-destructive" onClick={() => handleDeleteJob(job.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {expandedJob === job.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>

                        {job.status === 'running' && (
                          <div className="px-3 pb-3">
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div className="bg-primary h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none" style={{ width: `${job.progress}%` }} />
                            </div>
                          </div>
                        )}

                        {expandedJob === job.id && (
                          <div className="border-t border-border/50 bg-muted/20 p-3 max-h-60 overflow-y-auto">
                            {job.logs.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No logs yet</p>
                            ) : (
                              <div className="space-y-1">
                                {job.logs.slice().reverse().map((log, i) => (
                                  <div key={i} className="flex items-start gap-2 text-xs">
                                    <span className="text-muted-foreground shrink-0 font-mono tabular-nums">{formatTime(log.timestamp)}</span>
                                    <span className={
                                      log.type === 'success' || /MP4 .+object storage/i.test(log.message || '')
                                        ? 'text-green-700 dark:text-green-400'
                                        : log.type === 'error'
                                          ? 'text-red-600 dark:text-red-400'
                                          : log.type === 'warning'
                                            ? 'text-amber-700 dark:text-amber-300'
                                            : 'text-foreground'
                                    }>
                                      {log.message}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        variant="destructive"
        onConfirm={() => {
          confirmAction?.()
          setConfirmOpen(false)
          setConfirmAction(null)
        }}
        onCancel={() => {
          setConfirmOpen(false)
          setConfirmAction(null)
        }}
      />
    </div>
  )
}

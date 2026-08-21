'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CheckCircle2, Loader2, AlertTriangle, Clock, Play, Pause,
  RotateCcw, Trash2, Eye, ChevronDown, ChevronUp, Zap, BookOpen,
  RefreshCw, Plus, Search, BarChart3
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

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
  logs: JobLog[]
  startedAt: string
  completedAt?: string
  error?: string
}

const TECHNOLOGIES = [
  'Java', 'Python', 'JavaScript', 'TypeScript', 'React', 'Next.js',
  'Node.js', 'C#', '.NET', 'C++', 'Go', 'Rust', 'Kotlin', 'Swift',
  'SQL', 'PostgreSQL', 'MongoDB', 'AWS', 'Azure', 'GCP', 'Docker',
  'Kubernetes', 'Terraform', 'Data Engineering', 'Machine Learning',
  'AI', 'Cybersecurity', 'DevOps', 'System Design'
]

const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert']

export default function CourseGeneratorPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  // Form state
  const [technology, setTechnology] = useState('')
  const [level, setLevel] = useState('')
  const [customTech, setCustomTech] = useState('')

  // Job state
  const [jobs, setJobs] = useState<GenerationJob[]>([])
  const [activeJob, setActiveJob] = useState<GenerationJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  // Course state
  const [existingCourses, setExistingCourses] = useState<any[]>([])
  const [courseTab, setCourseTab] = useState('all')

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState('')
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

  // Load data
  useEffect(() => {
    loadJobs()
    loadExistingCourses()
    // Auto-refresh every 10 seconds for running jobs
    const interval = setInterval(() => {
      if (jobs.some(j => j.status === 'running')) {
        loadJobs()
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const loadJobs = async () => {
    try {
      const res = await csrfFetch('/api/admin/courses/jobs', { credentials: 'include' })
      const data = await res.json()
      if (data.jobs) setJobs(data.jobs)
    } catch {}
    setLoading(false)
  }

  const loadExistingCourses = async () => {
    try {
      const res = await csrfFetch('/api/admin/courses', { credentials: 'include' })
      const data = await res.json()
      if (data.data) setExistingCourses(data.data)
    } catch {}
  }

  const selectedTech = customTech || technology

  // Start generation (server-side worker)
  const handleGenerate = async () => {
    if (!selectedTech || !level) {
      addToast({ type: 'error', title: 'Select technology and level' })
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
      const currData = await currRes.json()
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
        }),
      })
      const jobData = await jobRes.json()

      // Step 3: Start server-side worker
      await csrfFetch('/api/admin/courses/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId: jobData.job.id }),
      })

      addToast({ type: 'success', title: 'Video generation started in background' })
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
        }),
      })
      const jobData = await jobRes.json()

      // Start worker
      await csrfFetch('/api/admin/courses/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId: jobData.job.id }),
      })

      addToast({ type: 'success', title: `Regeneration started for "${courseTitle}"` })
      loadJobs()
    } catch (e: any) {
      addToast({ type: 'error', title: e.message })
    }
  }

  // Delete course
  const handleDeleteCourse = (courseId: string, title: string) => {
    setConfirmTitle('Delete Course')
    setConfirmMessage(`Delete "${title}"? This action cannot be undone. All videos, quizzes, and progress will be permanently removed.`)
    setConfirmAction(() => async () => {
      try {
        await csrfFetch(`/api/admin/courses/generate-curriculum?courseId=${courseId}`, {
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
  const handleDeleteJob = (jobId: string) => {
    setConfirmTitle('Delete Job')
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
      pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
      running: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      completed: 'bg-green-500/10 text-green-600 border-green-500/20',
      failed: 'bg-red-500/10 text-red-600 border-red-500/20',
      cancelled: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
    }
    return (
      <Badge variant="outline" className={`text-xs ${styles[status] || styles.pending}`}>
        {status}
      </Badge>
    )
  }

  if (!gate.ready) return null

  const runningJobs = jobs.filter(j => j.status === 'running' || j.status === 'pending')
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Course Generator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate courses with AI videos, quizzes, and certificates
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Generation Form */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              New Course
            </h2>

            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5 block">Technology</label>
              <select value={technology} onChange={e => setTechnology(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm">
                <option value="">Select or type custom</option>
                {TECHNOLOGIES.map(tech => <option key={tech} value={tech}>{tech}</option>)}
              </select>
              <input type="text" value={customTech} onChange={e => setCustomTech(e.target.value)} placeholder="Or type custom..." className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm mt-2" />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5 block">Level</label>
              <select value={level} onChange={e => setLevel(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm">
                <option value="">Select level</option>
                {LEVELS.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
            </div>

            <Button onClick={handleGenerate} disabled={generating || !selectedTech || !level} className="w-full gap-2">
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Zap className="h-4 w-4" /> Generate Course</>}
            </Button>
          </Card>

          {/* Stats Card */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Quick Stats
            </h2>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-lg font-bold">{existingCourses.length}</p>
                <p className="text-[10px] text-muted-foreground">Courses</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-lg font-bold">{jobs.length}</p>
                <p className="text-[10px] text-muted-foreground">Jobs</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-lg font-bold text-green-600">{completedJobs.filter(j => j.status === 'completed').length}</p>
                <p className="text-[10px] text-muted-foreground">Completed</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/30">
                <p className="text-lg font-bold text-blue-600">{runningJobs.length}</p>
                <p className="text-[10px] text-muted-foreground">Running</p>
              </div>
            </div>
          </Card>
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
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold">Existing Courses</h2>
                  <Button variant="ghost" size="sm" onClick={loadExistingCourses}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {existingCourses.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p>No courses yet. Create your first course above.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {existingCourses.map((course: any) => {
                      const hasVideos = course.sections?.some((s: any) => s.lessons?.some((l: any) => l.script?.length > 0))
                      const totalLessons = course.sections?.reduce((sum: number, s: any) => sum + (s.lessons?.length || 0), 0) || 0
                      const videosGenerated = course.sections?.reduce((sum: number, s: any) => sum + (s.lessons?.filter((l: any) => l.script?.length > 0)?.length || 0), 0) || 0

                      return (
                        <div key={course.id} className="flex items-center justify-between p-3 rounded-lg border border-border/60 hover:bg-muted/20">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <BookOpen className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{course.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {course.sections?.length || 0} modules · {videosGenerated}/{totalLessons} videos
                                {videosGenerated < totalLessons && (
                                  <span className="text-yellow-500 ml-1">({totalLessons - videosGenerated} pending)</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleRegenerate(course.id, course.title)} title="Regenerate videos (Force)">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Link href={`/dashboard/admin/courses/${course.id}`}>
                              <Button variant="ghost" size="sm" title="Edit course">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteCourse(course.id, course.title)} title="Delete course" className="text-red-500 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Jobs Tab */}
            <TabsContent value="jobs" className="mt-4">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold">Generation Jobs</h2>
                  <Button variant="ghost" size="sm" onClick={loadJobs}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {jobs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Clock className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p>No jobs yet. Generate a course to start.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {jobs.map(job => (
                      <div key={job.id} className="border border-border/60 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30" onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={job.status} />
                            <div>
                              <p className="text-sm font-medium">{job.courseTitle}</p>
                              <p className="text-xs text-muted-foreground">
                                {job.completedItems}/{job.totalItems} items
                                {job.failedItems > 0 && <span className="text-red-500 ml-2">{job.failedItems} failed</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {expandedJob === job.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>

                        {job.status === 'running' && (
                          <div className="px-3 pb-3">
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${job.progress}%` }} />
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
                                    <span className="text-muted-foreground shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    <span className={log.type === 'success' ? 'text-green-600' : log.type === 'error' ? 'text-red-600' : log.type === 'warning' ? 'text-yellow-600' : 'text-foreground'}>
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
              </Card>
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

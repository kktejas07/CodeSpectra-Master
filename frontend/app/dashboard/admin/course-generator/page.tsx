'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  CheckCircle2, Loader2, AlertTriangle, Clock, Play, Pause,
  RotateCcw, Trash2, Eye, ChevronDown, ChevronUp, Zap, BookOpen,
  Video, FileText, Image, ArrowRight, RefreshCw
} from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

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

  // Load jobs on mount
  useEffect(() => {
    loadJobs()
  }, [])

  const loadJobs = async () => {
    try {
      const res = await csrfFetch('/api/admin/courses/jobs', { credentials: 'include' })
      const data = await res.json()
      if (data.jobs) setJobs(data.jobs)
    } catch {}
    setLoading(false)
  }

  const selectedTech = customTech || technology

  // Start generation
  const handleGenerate = async () => {
    if (!selectedTech || !level) {
      addToast({ type: 'error', title: 'Select technology and level' })
      return
    }

    setGenerating(true)

    try {
      // Step 1: Generate curriculum
      addToast({ type: 'info', title: 'Generating curriculum...' })
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

      addToast({ type: 'success', title: `Curriculum created: ${currData.course?.title}` })

      // Step 2: Create job for video generation
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
      const job = jobData.job
      setActiveJob(job)

      // Step 3: Generate videos one by one
      const course = currData.course
      if (course?.sections) {
        for (let sIdx = 0; sIdx < course.sections.length; sIdx++) {
          const section = course.sections[sIdx]
          for (let lIdx = 0; lIdx < (section.lessons?.length || 0); lIdx++) {
            const lesson = section.lessons[lIdx]

            // Update job progress
            await csrfFetch('/api/admin/courses/jobs', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                jobId: job.id,
                updates: {
                  status: 'running',
                  completedItems: job.completedItems,
                  log: {
                    timestamp: new Date().toISOString(),
                    message: `Generating: ${section.title} > ${lesson.title}`,
                    type: 'info',
                  },
                },
              }),
            })

            try {
              // Generate video for this lesson
              const vidRes = await csrfFetch('/api/admin/courses/generate-video', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  topic: lesson.content || lesson.title,
                  courseId,
                  sectionIndex: sIdx,
                  lessonIndex: lIdx,
                  techStack: selectedTech,
                }),
              })

              if (vidRes.ok) {
                job.completedItems++
                await csrfFetch('/api/admin/courses/jobs', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    jobId: job.id,
                    updates: {
                      completedItems: job.completedItems,
                      progress: Math.round((job.completedItems / job.totalItems) * 100),
                      log: {
                        timestamp: new Date().toISOString(),
                        message: `Completed: ${lesson.title}`,
                        type: 'success',
                      },
                    },
                  }),
                })
              } else {
                throw new Error('Video generation failed')
              }
            } catch (e: any) {
              job.failedItems++
              await csrfFetch('/api/admin/courses/jobs', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  jobId: job.id,
                  updates: {
                    failedItems: job.failedItems,
                    log: {
                      timestamp: new Date().toISOString(),
                      message: `Failed: ${lesson.title} — ${e.message}`,
                      type: 'error',
                    },
                  },
                }),
              })
            }

            // Brief pause between requests
            await new Promise(r => setTimeout(r, 500))
          }
        }
      }

      // Complete job
      await csrfFetch('/api/admin/courses/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          jobId: job.id,
          updates: {
            status: 'completed',
            progress: 100,
            completedAt: new Date().toISOString(),
            log: {
              timestamp: new Date().toISOString(),
              message: `Job completed: ${job.completedItems} videos generated, ${job.failedItems} failed`,
              type: job.failedItems > 0 ? 'warning' : 'success',
            },
          },
        }),
      })

      addToast({
        type: job.failedItems > 0 ? 'warning' : 'success',
        title: `Done: ${job.completedItems}/${job.totalItems} videos generated`,
      })

      loadJobs()
    } catch (e: any) {
      addToast({ type: 'error', title: e.message })
    } finally {
      setGenerating(false)
      setActiveJob(null)
    }
  }

  // Retry failed items
  const handleRetry = async (job: GenerationJob) => {
    addToast({ type: 'info', title: 'Retry not yet implemented' })
  }

  // Delete job
  const handleDeleteJob = async (jobId: string) => {
    try {
      await csrfFetch(`/api/admin/courses/jobs?jobId=${jobId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      setJobs(jobs.filter(j => j.id !== jobId))
      addToast({ type: 'success', title: 'Job deleted' })
    } catch {}
  }

  // Status badge
  const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
      pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
      running: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      completed: 'bg-green-500/10 text-green-600 border-green-500/20',
      failed: 'bg-red-500/10 text-red-600 border-red-500/20',
      cancelled: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
    }
    return (
      <Badge variant="outline" className={`text-xs ${styles[status as keyof typeof styles] || styles.pending}`}>
        {status}
      </Badge>
    )
  }

  if (!gate.ready) return null

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
        <div className="lg:col-span-1">
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              New Course
            </h2>

            {/* Technology */}
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Technology
              </label>
              <select
                value={technology}
                onChange={e => setTechnology(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm"
              >
                <option value="">Select or type custom</option>
                {TECHNOLOGIES.map(tech => (
                  <option key={tech} value={tech}>{tech}</option>
                ))}
              </select>
              <input
                type="text"
                value={customTech}
                onChange={e => setCustomTech(e.target.value)}
                placeholder="Or type custom technology..."
                className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm mt-2"
              />
            </div>

            {/* Level */}
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5 block">
                Level
              </label>
              <select
                value={level}
                onChange={e => setLevel(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm"
              >
                <option value="">Select level</option>
                {LEVELS.map(lvl => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={generating || !selectedTech || !level}
              className="w-full gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Generate Course
                </>
              )}
            </Button>

            {generating && activeJob && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{activeJob.completedItems}/{activeJob.totalItems}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${activeJob.progress}%` }}
                  />
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right: Job History */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Generation History
              </h2>
              <Button variant="ghost" size="sm" onClick={loadJobs}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading...
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>No generation jobs yet. Create your first course above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map(job => (
                  <div
                    key={job.id}
                    className="border border-border/60 rounded-lg overflow-hidden"
                  >
                    {/* Job Header */}
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                      onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    >
                      <div className="flex items-center gap-3">
                        <StatusBadge status={job.status} />
                        <div>
                          <p className="text-sm font-medium">{job.courseTitle}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.completedItems}/{job.totalItems} items
                            {job.failedItems > 0 && (
                              <span className="text-red-500 ml-2">{job.failedItems} failed</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.status === 'completed' && job.failedItems > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleRetry(job) }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Link href={`/dashboard/admin/courses/${job.courseId}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        {expandedJob === job.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {job.status === 'running' && (
                      <div className="px-3 pb-3">
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Expanded Logs */}
                    {expandedJob === job.id && (
                      <div className="border-t border-border/50 bg-muted/20 p-3 max-h-60 overflow-y-auto">
                        {job.logs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No logs yet</p>
                        ) : (
                          <div className="space-y-1">
                            {job.logs.slice().reverse().map((log, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <span className="text-muted-foreground shrink-0">
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                                <span className={
                                  log.type === 'success' ? 'text-green-600' :
                                  log.type === 'error' ? 'text-red-600' :
                                  log.type === 'warning' ? 'text-yellow-600' :
                                  'text-foreground'
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
          </Card>
        </div>
      </div>
    </div>
  )
}

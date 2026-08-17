'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle2, Loader2, Play, BookOpen, HelpCircle, Sparkles, MonitorPlay, ExternalLink } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface Lesson {
  title: string
  type: string
  estimated_minutes: number
  resources?: Array<{ provider: string; url: string; embed_url?: string }>
}

interface Module {
  title: string
  description: string
  lessons?: Lesson[]
}

interface Course {
  id: string
  title: string
  description: string
  level: string
  estimated_hours: number
  modules?: Module[]
}

export default function CourseGeneratorPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  const [technology, setTechnology] = useState('')
  const [level, setLevel] = useState('')
  const [goal, setGoal] = useState('')
  const [duration, setDuration] = useState(20)
  const [includeProjects, setIncludeProjects] = useState(true)
  const [includeAssessments, setIncludeAssessments] = useState(true)
  const [includeCertificate, setIncludeCertificate] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [course, setCourse] = useState<Course | null>(null)
  const [error, setError] = useState<string | null>(null)

  const TECHNOLOGIES = [
    'Java', 'Python', 'JavaScript', 'TypeScript', 'React', 'Next.js',
    'Node.js', 'C#', '.NET', 'C++', 'Go', 'Rust', 'Kotlin', 'Swift',
    'SQL', 'PostgreSQL', 'MongoDB', 'AWS', 'Azure', 'GCP', 'Docker',
    'Kubernetes', 'Terraform', 'Data Engineering', 'Machine Learning',
    'AI', 'Cybersecurity', 'DevOps', 'System Design'
  ]

  const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert']

  const handleGenerate = async () => {
    if (!technology || !level) {
      addToast({ type: 'error', title: 'Missing Fields', message: 'Please select technology and level' })
      return
    }

    setGenerating(true)
    setError(null)
    setCourse(null)

    try {
      const res = await csrfFetch('/api/learning/generate-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          technology,
          level,
          goal: goal || `Master ${technology} at ${level} level`,
          duration_hours: parseInt(duration.toString()) || 20,
          includeProjects,
          includeAssessments,
          includeCertificate,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Generation failed')
      }

      const data = await res.json()
      setCourse(data)
      addToast({ type: 'success', title: 'Course Generated', message: 'Your course has been generated successfully!' })
    } catch (err: any) {
      setError(err.message || 'Failed to generate course')
      addToast({ type: 'error', title: 'Generation Failed', message: err.message || 'Unknown error' })
    } finally {
      setGenerating(false)
    }
  }

  if (!gate.ready) return null

  const totalLessons = course?.modules?.reduce((acc, m) => acc + (m.lessons?.length || 0), 0) || 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          AI Course Generator
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1 inline-block" />
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs max-w-[250px]">
                  Generate a full learning curriculum with modules and lessons for any technology,
                  auto-enriched with embeddable videos. Courses are saved to the Learning Platform
                  for your students to take.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a technology and level, then generate a complete course with modules, lessons,
          assessments, and a certificate.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Generator Form */}
        <div className="rounded-xl border border-border/60 bg-card/40 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            Course Configuration
          </div>

          <Field label="Technology">
            <select
              value={technology}
              onChange={(e) => setTechnology(e.target.value)}
              data-testid="cg-technology"
              className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select a technology</option>
              {TECHNOLOGIES.map((tech) => (
                <option key={tech} value={tech}>
                  {tech}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Level">
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              data-testid="cg-level"
              className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select a level</option>
              {LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Duration (hours)">
            <input
              type="number"
              min={1}
              max={200}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 20)}
              data-testid="cg-duration"
              className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>

          <Field label="Goal (optional)">
            <input
              type="text"
              placeholder="e.g., Become job-ready, Pass certification, Build projects"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              data-testid="cg-goal"
              className="w-full rounded-md border border-border bg-background px-3 h-9 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Field>

          <div className="space-y-2 pt-1">
            {[
              { key: 'includeProjects' as const, label: 'Include hands-on projects', value: includeProjects },
              { key: 'includeAssessments' as const, label: 'Include assessments and quizzes', value: includeAssessments },
              { key: 'includeCertificate' as const, label: 'Include completion certificate', value: includeCertificate },
            ].map(({ key, label, value }) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => {
                    if (key === 'includeProjects') setIncludeProjects(e.target.checked)
                    else if (key === 'includeAssessments') setIncludeAssessments(e.target.checked)
                    else setIncludeCertificate(e.target.checked)
                  }}
                  data-testid={`cg-${key}`}
                  className="h-4 w-4 text-primary rounded"
                />
                {label}
              </label>
            ))}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || !technology || !level}
            className="w-full gap-1.5"
            data-testid="cg-run"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating course...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Course
              </>
            )}
          </Button>

          {error && (
            <Alert variant="destructive" className="py-3">
              <AlertTitle className="text-sm">Generation Error</AlertTitle>
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Result Preview */}
        <div className="rounded-xl border border-border/60 bg-card/40 p-5 overflow-hidden">
          <div className="text-sm font-semibold mb-3">Generated Course</div>
          {!course && !generating && (
            <p className="text-xs text-muted-foreground">
              Your generated course will appear here. Courses are saved to the Learning Platform
              and can be opened by your students.
            </p>
          )}
          {generating && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p className="text-sm">Building your course… this can take a minute.</p>
            </div>
          )}
          {course && !generating && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold">{course.title}</h3>
                  {course.level && <Badge variant="outline">{course.level}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{course.description}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-lg font-bold">{course.estimated_hours ?? 0}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Hours</p>
                </div>
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-lg font-bold">{course.modules?.length || 0}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Modules</p>
                </div>
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-lg font-bold">{totalLessons}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Lessons</p>
                </div>
              </div>

              {course.id && (
                <div className="flex gap-2">
                  <Button className="flex-1" asChild>
                    <Link href={`/dashboard/learning/${course.id}`}>
                      <MonitorPlay className="h-4 w-4 mr-1.5" />
                      View in Learning Platform
                    </Link>
                  </Button>
                  <Button variant="outline" className="flex-1" asChild>
                    <Link href={`/dashboard/learning/${course.id}`}>
                      <BookOpen className="h-4 w-4 mr-1.5" />
                      Open Course
                    </Link>
                  </Button>
                </div>
              )}

              {course.modules && course.modules.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Modules</div>
                  {course.modules.map((module, index) => (
                    <div key={module.title || `module-${index}`} className="rounded-lg border border-border/60 overflow-hidden">
                      <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 border-b border-border/60">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/20 text-primary text-xs font-bold shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{module.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{module.description}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {module.lessons?.length || 0} lessons
                        </Badge>
                      </div>
                      {module.lessons && module.lessons.length > 0 && (
                        <div className="divide-y divide-border/40">
                          {module.lessons.map((lesson, lessonIndex) => (
                            <div key={lesson.title || `lesson-${lessonIndex}`} className="flex items-center gap-3 px-3 py-2">
                              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-primary text-[9px] font-bold shrink-0">
                                {lessonIndex + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{lesson.title}</p>
                              </div>
                              {lesson.resources && lesson.resources.length > 0 && (
                                <a
                                  href={lesson.resources[0].url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors shrink-0"
                                >
                                  <Play className="h-2.5 w-2.5" />
                                  <span className="capitalize">{lesson.resources[0].provider}</span>
                                  {lesson.resources[0].embed_url ? (
                                    <Badge variant="secondary" className="text-[9px] px-1">embed</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] px-1">link</Badge>
                                  )}
                                </a>
                              )}
                              <span className="text-xs text-muted-foreground shrink-0 w-10 text-right">
                                {lesson.estimated_minutes || 0}m
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {course.id && (
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/dashboard/learning/${course.id}`}>
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Open full course
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  )
}
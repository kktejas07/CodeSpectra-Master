'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle2, Loader2, Play, BookOpen, Trophy, Sparkles, Zap, RefreshCw, ExternalLink } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

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
  const [course, setCourse] = useState<any>(null)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">AI Course Generator</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate complete learning courses with modules, lessons, assessments, and certificates
          using AI. Select your technology and level to get started.
        </p>
      </div>

      {/* Generator Form */}
      <Card className="space-y-4">
        <h2 className="font-semibold text-foreground">Course Configuration</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Technology</label>
            <select
              value={technology}
              onChange={(e) => setTechnology(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus-ring-primary"
            >
              <option value="">Select a technology</option>
              {TECHNOLOGIES.map((tech) => (
                <option key={tech} value={tech}>
                  {tech}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Level</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus-ring-primary"
            >
              <option value="">Select a level</option>
              {LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Duration (hours)</label>
            <input
              type="number"
              min={1}
              max={200}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 20)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus-ring-primary"
            />
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-foreground mb-2">Goal (optional)</label>
            <input
              type="text"
              placeholder="e.g., Become job-ready, Pass certification, Build projects"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus-ring-primary"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-start space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeProjects}
                  onChange={(e) => setIncludeProjects(e.target.checked)}
                  className="h-4 w-4 text-primary"
                />
                Include hands-on projects
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeAssessments}
                  onChange={(e) => setIncludeAssessments(e.target.checked)}
                  className="h-4 w-4 text-primary"
                />
                Include assessments and quizzes
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeCertificate}
                  onChange={(e) => setIncludeCertificate(e.target.checked)}
                  className="h-4 w-4 text-primary"
                />
                Include completion certificate
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            onClick={handleGenerate}
            disabled={generating || !technology || !level}
            className="gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating course...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Generate Course
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Generation Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Generated Course Preview */}
      {course && !generating && (
        <Card className="space-y-4">
          <h2 className="font-semibold text-foreground">
            {course.title}
            <Badge variant="outline" className="ml-2">
              {course.level}
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground mb-4">{course.description}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p><strong>Estimated Duration:</strong> {course.estimated_hours} hours</p>
              <p><strong>Modules:</strong> {course.modules?.length || 0}</p>
              <p><strong>Source:</strong> AI Generated</p>
            </div>
            <div className="space-y-2">
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/dashboard/learning/ai-generated/${course.id || 'course'}`}>
                  View Learning Path
                </Link>
              </Button>
              <Button className="w-full" asChild>
                <Link href={`/dashboard/learning/${course.id || 'course'}`}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  View in Learning Platform
                </Link>
              </Button>
            </div>
          </div>

          {/* Modules */}
          {course.modules && course.modules.length > 0 && (
            <>
              <h3 className="font-semibold text-foreground mt-6 mb-2">Course Modules</h3>
              <div className="space-y-3">
                {course.modules.map((module: any, index: number) => (
                  <Card key={module.title || `module-${index}`} className="p-4 border-border/60">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground">{module.title}</h3>
                        <p className="text-xs text-muted-foreground">{module.description}</p>
                        <p className="text-sm font-medium text-foreground mt-1">
                          {module.lessons?.length || 0} lessons
                        </p>
                      </div>
                    </div>
                    {module.lessons && module.lessons.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Lessons:</p>
                        <div className="space-y-1">
                          {module.lessons.map((lesson: any, lessonIndex: number) => (
                            <div key={lesson.title || `lesson-${lessonIndex}`} className="space-y-1 px-3 py-1 bg-muted/50 rounded">
                              <div className="flex items-start gap-2">
                                <div className="flex h-3 w-3 items-center justify-center rounded-full bg-primary/20 text-primary shrink-0">
                                  {lessonIndex + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-foreground">{lesson.title}</p>
                                  <p className="text-xs text-muted-foreground">{lesson.type}</p>
                                </div>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {lesson.estimated_minutes} min
                                </span>
                              </div>
                              {lesson.resources && lesson.resources.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pl-5">
                                  {lesson.resources.map((r: any, i: number) => (
                                    <a
                                      key={`${r.provider}-${i}`}
                                      href={r.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                                    >
                                      <Play className="h-2.5 w-2.5" />
                                      <span className="capitalize">{r.provider}</span>
                                      {r.embed_url ? <Badge variant="secondary" className="text-[9px] px-1">embed</Badge> : <Badge variant="outline" className="text-[9px] px-1">link</Badge>}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
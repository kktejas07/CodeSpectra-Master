'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, type TourStep } from '@/components/tour/tour-context'
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, toDifficultyLevel } from '@/lib/difficulty-levels'
import { Trophy, BarChart3, CheckCircle, XCircle, FileText, BrainCircuit } from 'lucide-react'
import { SkeletonStats, SkeletonCard, SkeletonTable } from '@/components/ui/skeleton-boneyard'

interface Attempt {
  id: string
  exam_id: string
  title: string
  level: string
  score: number | null
  total_questions: number
  answered: number
  passed: boolean
  status: string
  submitted_at: string
  certificate_url?: string
}

interface AvailableExam {
  id: string
  title: string
  level: string
  subject?: string
  duration: number
  questions: number
  access_type: 'invite_only' | 'open'
  source: 'invite' | 'open'
  invite_status?: string
  target_url: string
}

export default function MyAssessmentsPage() {
  const gate = usePageGuard('user')
  const router = useRouter()
  const { startTour, setTourSeen } = useTour()
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [available, setAvailable] = useState<AvailableExam[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gate.ready) return
    fetch('/api/user/assessments', { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.attempts) setAttempts(json.attempts)
        if (Array.isArray(json.available)) setAvailable(json.available)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [gate.ready])

  // Initialize tour on first visit
  useEffect(() => {
    if (gate.ready && !localStorage.getItem('has_seen_assessments_tour')) {
      const assessmentsTour: TourStep[] = [
        {
          target: '[data-tour="assessments-header"]',
          title: 'My Assessments',
          description: 'View your past assessment attempts, scores, and certificates.',
          position: 'bottom',
        },
        {
          target: '[data-tour="assessments-browse"]',
          title: 'Browse Assessments',
          description: 'Explore available assessments to take and earn certificates.',
          position: 'bottom',
        },
        {
          target: '[data-tour="assessments-kpis"]',
          title: 'Your Stats',
          description: 'See your total attempts, pass rate, and average score.',
          position: 'bottom',
        },
        {
          target: '[data-tour="assessments-ready"]',
          title: 'Ready to Take',
          description: 'Assessments assigned to you or open for you to start now.',
          position: 'bottom',
        },
        {
          target: '[data-tour="assessments-table"]',
          title: 'Attempt History',
          description: 'Review your detailed attempt history and track your progress.',
          position: 'bottom',
        },
      ]
      startTour(assessmentsTour, 'assessments')
      setTourSeen('assessments')
    }
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted/60 animate-pulse" />
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted/60 rounded animate-pulse" />
            <div className="h-4 w-64 bg-muted/40 rounded animate-pulse" />
          </div>
        </div>
        <SkeletonStats />
        <SkeletonCard />
        <SkeletonTable rows={5} />
      </div>
    )
  }

  const totalAttempts = attempts.length
  const passedCount = attempts.filter(a => a.passed).length
  const avgScore = totalAttempts > 0
    ? Math.round(attempts.reduce((sum, a) => sum + (a.score ?? 0), 0) / totalAttempts)
    : 0

  const columns: DataTableColumn<Attempt>[] = [
    {
      key: 'title',
      header: 'Assessment',
      cell: (row) => (
        <div>
          <p className="font-medium text-foreground">{row.title}</p>
          <p className="text-xs text-muted-foreground">ID: {row.exam_id.slice(0, 8)}</p>
        </div>
      ),
    },
    {
      key: 'level',
      header: 'Level',
      cell: (row) => {
        const dl = toDifficultyLevel(row.level)
        const label = dl ? DIFFICULTY_LABELS[dl] : (row.level || '—')
        const color = dl ? DIFFICULTY_COLORS[dl] : 'bg-muted text-muted-foreground'
        return <Badge variant="outline" className={`text-xs ${color}`}>{label}</Badge>
      },
    },
    {
      key: 'score',
      header: 'Score',
      cell: (row) => (
        <span className="font-semibold tabular-nums">
          {row.score != null ? `${row.score}%` : '—'}
        </span>
      ),
    },
    {
      key: 'passed',
      header: 'Status',
      cell: (row) => (
        <Badge variant="outline" className={`text-xs gap-1 ${
          row.passed ? 'text-green-600 border-green-500/30' : 'text-red-600 border-red-500/30'
        }`}>
          {row.passed ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {row.passed ? 'Pass' : 'Fail'}
        </Badge>
      ),
    },
    {
      key: 'submitted_at',
      header: 'Date',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.submitted_at ? new Date(row.submitted_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          }) : '—'}
        </span>
      ),
    },
    {
      key: 'certificate_url',
      header: 'Certificate',
      cell: (row) => (
        row.certificate_url ? (
          <a href={row.certificate_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
            View
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3" data-tour="assessments-header">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Assessments</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your past assessment attempts and results</p>
          </div>
        </div>
        <Link href="/dashboard/assessments" data-tour="assessments-browse">
          <Button variant="outline" size="sm" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Browse Assessments
          </Button>
        </Link>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-3" data-tour="assessments-kpis">
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalAttempts}</p>
              <p className="text-xs text-muted-foreground">Total Attempts</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{passedCount}</p>
              <p className="text-xs text-muted-foreground">Passed</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <Trophy className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{avgScore}%</p>
              <p className="text-xs text-muted-foreground">Average Score</p>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Fluency Assessment Card */}
      <Card className="border-border/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <BrainCircuit className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">AI Fluency Assessment</p>
              <p className="text-xs text-muted-foreground">
                Test your prompt engineering, AI output review, debugging, decision-making & chaining skills
              </p>
            </div>
          </div>
          <Link href="/dashboard/assessments/ai-fluency/setup">
            <Button size="sm" className="gap-1">
              Start <BarChart3 className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </Card>

      {/* Assigned / Ready-to-take */}
      {available.length > 0 && (
        <div className="space-y-3" data-tour="assessments-ready">
          <h2 className="text-lg font-semibold text-foreground">Ready to take</h2>
          {available.map(ex => (
            <Card key={ex.id} className="border-border/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-foreground">{ex.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Level {(ex.level || '').toLowerCase()} · {ex.duration} min · {ex.questions} questions
                  </p>
                  <Badge variant="outline" className={`text-xs ${
                    ex.source === 'invite' ? 'border-primary/40 text-primary' : 'text-muted-foreground'
                  }`}>
                    {ex.source === 'invite' ? 'Assigned to you' : 'Open assessment'}
                  </Badge>
                </div>
                <Button size="sm" onClick={() => router.push(ex.target_url)}>
                  Start
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Attempts Table */}
      <div data-tour="assessments-table">
      {attempts.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">You haven't taken any assessments yet.</p>
          <Link href="/dashboard/assessments">
            <Button variant="outline" size="sm" className="mt-4">Browse Assessments</Button>
          </Link>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={attempts.map(a => ({ ...a, id: a.id }))}
          searchPlaceholder="Search assessments..."
          searchKeys={['title', 'level']}
          pageSize={15}
          emptyMessage="No attempts found"
        />
      )}
      </div>
    </div>
  )
}

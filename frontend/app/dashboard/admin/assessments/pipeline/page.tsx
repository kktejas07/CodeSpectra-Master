'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import {
  LayoutDashboard,
  Loader2,
  Users,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Trophy,
  Mail,
  Play,
  BarChart3,
} from 'lucide-react'

interface ExamOption {
  id: string
  title: string
}

interface PipelineCandidate {
  id: string
  email: string
  name: string
  company?: string | null
  role?: string | null
  status: 'invited' | 'inProgress' | 'completed' | 'passed' | 'failed'
  invitedAt: string
  startedAt?: string
  completedAt?: string
  score?: number
  passed?: boolean
}

interface PipelineData {
  stages: {
    invited: PipelineCandidate[]
    inProgress: PipelineCandidate[]
    completed: PipelineCandidate[]
    passed: PipelineCandidate[]
    failed: PipelineCandidate[]
  }
  stats: {
    total: number
    invited: number
    inProgress: number
    completed: number
    passed: number
    failed: number
    passRate: number
    avgScore: number
  }
  examTitle: string
}

const STAGE_CONFIG = [
  { key: 'invited' as const, label: 'Invited', icon: Mail, color: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { key: 'inProgress' as const, label: 'In Progress', icon: Play, color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { key: 'completed' as const, label: 'Completed', icon: CheckCircle2, color: 'text-gray-600', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
  { key: 'passed' as const, label: 'Passed', icon: Trophy, color: 'text-green-600', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  { key: 'failed' as const, label: 'Failed', icon: XCircle, color: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' },
] as const

export default function PipelinePage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  const [exams, setExams] = useState<ExamOption[]>([])
  const [loadingExams, setLoadingExams] = useState(true)
  const [selectedExamId, setSelectedExamId] = useState('')
  const [pipeline, setPipeline] = useState<PipelineData | null>(null)
  const [loadingPipeline, setLoadingPipeline] = useState(false)

  useEffect(() => {
    fetch('/api/exams', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setExams(d.data || []))
      .catch(() => {})
      .finally(() => setLoadingExams(false))
  }, [])

  useEffect(() => {
    if (!selectedExamId) { setPipeline(null); return }
    setLoadingPipeline(true)
    fetch(`/api/admin/assessments/pipeline?examId=${selectedExamId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setPipeline(d)
      })
      .catch(err => addToast({ type: 'error', title: err.message || 'Failed to load pipeline' }))
      .finally(() => setLoadingPipeline(false))
  }, [selectedExamId, addToast])

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <LayoutDashboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Candidate Pipeline</h1>
            <p className="text-sm text-muted-foreground">Track candidates through each stage of the assessment</p>
          </div>
        </div>
      </div>

      {/* Exam selector */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">Assessment:</span>
          <Select value={selectedExamId} onValueChange={setSelectedExamId}>
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder={loadingExams ? 'Loading...' : 'Select an assessment'} />
            </SelectTrigger>
            <SelectContent>
              {exams.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Empty state: no exam selected */}
      {!selectedExamId && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">Select an assessment to view pipeline</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Choose an assessment from the dropdown above</p>
        </div>
      )}

      {/* Loading */}
      {selectedExamId && loadingPipeline && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading pipeline...
        </div>
      )}

      {/* Pipeline */}
      {selectedExamId && !loadingPipeline && pipeline && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                  <Users className="h-4.5 w-4.5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pipeline.stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Invited</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                  <TrendingUp className="h-4.5 w-4.5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pipeline.stats.total > 0 ? Math.round(((pipeline.stats.completed + pipeline.stats.passed + pipeline.stats.failed) / pipeline.stats.total) * 100) : 0}%</p>
                  <p className="text-xs text-muted-foreground">Completion Rate</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                  <Trophy className="h-4.5 w-4.5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pipeline.stats.passRate}%</p>
                  <p className="text-xs text-muted-foreground">Pass Rate</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <BarChart3 className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pipeline.stats.avgScore}%</p>
                  <p className="text-xs text-muted-foreground">Average Score</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Kanban columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {STAGE_CONFIG.map(({ key, label, icon: Icon, color, bg, border }) => {
              const items = pipeline.stages[key]
              return (
                <div key={key} className="flex flex-col">
                  <div className={`flex items-center gap-2 rounded-t-lg border ${border} ${bg} px-3 py-2`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                    <span className={`text-sm font-semibold ${color}`}>{label}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>
                  </div>
                  <div className={`flex-1 border border-t-0 ${border} rounded-b-lg bg-card/50 max-h-96 overflow-y-auto`}>
                    {items.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">No candidates</div>
                    ) : (
                      <div className="p-2 space-y-2">
                        {items.map(c => (
                          <div key={c.id} className="rounded-md border border-border/60 bg-card p-2.5 space-y-1 hover:shadow-sm transition-shadow">
                            <p className="text-sm font-medium truncate">{c.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                            {c.company && <p className="text-xs text-muted-foreground truncate">{c.company}</p>}
                            {c.score != null && (
                              <Badge className={`text-xs ${c.passed ? 'bg-green-500/20 text-green-700' : 'bg-red-500/20 text-red-700'}`}>
                                {c.score}%
                              </Badge>
                            )}
                            <p className="text-[11px] text-muted-foreground">
                              {c.completedAt
                                ? `Completed ${new Date(c.completedAt).toLocaleDateString()}`
                                : c.startedAt
                                ? `Started ${new Date(c.startedAt).toLocaleDateString()}`
                                : `Invited ${new Date(c.invitedAt).toLocaleDateString()}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Empty state for pipeline */}
          {pipeline.stats.total === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No candidates yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Schedule bulk assessments from the <a href="/dashboard/admin/assessments" className="text-primary hover:underline">Assessments</a> page
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

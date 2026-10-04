'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
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
  Download,
} from 'lucide-react'
import { SkeletonStats, SkeletonList } from '@/components/ui/skeleton-boneyard'

interface ExamOption {
  id: string
  title: string
}

interface PipelineCandidate {
  id: string
  userId?: string
  email: string
  name: string
  company?: string | null
  role?: string | null
  status: 'invited' | 'inProgress' | 'completed' | 'passed' | 'failed'
  invitedAt: string
  startedAt?: string
  completedAt?: string
  score?: number
  scorePct?: number
  passed?: boolean
  pipeline_stage?: string
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

/** Drag-and-drop recruitment board columns. 'none' holds everyone not yet moved. */
const RECRUITMENT_STAGES = [
  { key: 'none', label: 'New / Unstaged', color: 'text-slate-600', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
  { key: 'shortlisted', label: 'Shortlisted', color: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { key: 'hr', label: 'HR Round', color: 'text-violet-600', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  { key: 'technical', label: 'Technical Round', color: 'text-indigo-600', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  { key: 'offer', label: 'Offer', color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { key: 'hold', label: 'On Hold', color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { key: 'rejected', label: 'Rejected', color: 'text-rose-600', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
] as const

type RecruitStageKey = (typeof RECRUITMENT_STAGES)[number]['key']

export default function PipelinePage() {
  const gate = usePageGuard('tenant_admin')
  const addToast = useToast()

  const [exams, setExams] = useState<ExamOption[]>([])
  const [loadingExams, setLoadingExams] = useState(true)
  const [selectedExamId, setSelectedExamId] = useState('')
  const [pipeline, setPipeline] = useState<PipelineData | null>(null)
  const [loadingPipeline, setLoadingPipeline] = useState(false)
  // Optimistic stage overrides (userId -> stage) applied on drop before the API confirms.
  const [stageOverrides, setStageOverrides] = useState<Record<string, string>>({})
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [savingStage, setSavingStage] = useState<string | null>(null)

  /** Everyone who actually submitted — the pool the recruitment board moves. */
  const submitted = useMemo<PipelineCandidate[]>(() => {
    if (!pipeline) return []
    const all = [
      ...pipeline.stages.completed,
      ...pipeline.stages.passed,
      ...pipeline.stages.failed,
    ]
    const seen = new Set<string>()
    return all.filter((c) => {
      const key = c.userId || c.id
      if (!c.userId || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [pipeline])

  const stageOf = (c: PipelineCandidate): RecruitStageKey =>
    (stageOverrides[c.userId || c.id] || c.pipeline_stage || 'none') as RecruitStageKey

  const moveStage = async (candidate: PipelineCandidate, stage: RecruitStageKey) => {
    const key = candidate.userId || candidate.id
    if (!candidate.userId) {
      addToast({ type: 'error', title: 'Cannot move', message: 'No account linked to this candidate.' })
      return
    }
    if (stageOf(candidate) === stage) return
    const prev = stageOverrides[key]
    setStageOverrides((s) => ({ ...s, [key]: stage }))
    setSavingStage(key)
    try {
      const res = await csrfFetch(`/api/admin/exams/${selectedExamId}/submissions/${candidate.userId}/stage`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to save stage')
    } catch (e) {
      // Revert the optimistic move on failure.
      setStageOverrides((s) => {
        const n = { ...s }
        if (prev === undefined) delete n[key]
        else n[key] = prev
        return n
      })
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Failed to save stage' })
    } finally {
      setSavingStage(null)
    }
  }

  const exportShortlistCsv = () => {
    const rows = submitted
      .filter((c) => stageOf(c) !== 'none')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (rows.length === 0) {
      addToast({ type: 'info', title: 'No candidates have been moved to a stage yet' })
      return
    }
    const header = 'name,email,stage,score_pct'
    const body = rows.map((c) => {
      const stage = RECRUITMENT_STAGES.find((s) => s.key === stageOf(c))?.label || stageOf(c)
      const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`
      return [esc(c.name), esc(c.email), esc(stage), c.scorePct ?? ''].join(',')
    })
    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shortlist-${(pipeline?.examTitle || 'assessment').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    fetch('/api/exams', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setExams(d.data || []))
      .catch(() => {})
      .finally(() => setLoadingExams(false))
  }, [])

  useEffect(() => {
    if (!selectedExamId) { setPipeline(null); return }
    setStageOverrides({})
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
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonList count={4} />
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
                            {(c.scorePct ?? c.score) != null && (
                              <Badge variant={c.passed ? 'success' : 'danger'} className="text-xs">
                                {c.scorePct ?? c.score}%
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

          {/* Recruitment board — drag candidates between hiring stages.
              Independent of the assessment lanes above (those are computed). */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Recruitment pipeline</h2>
                <p className="text-xs text-muted-foreground">
                  Drag a candidate card between columns to move them (e.g. Shortlisted → HR Round → Offer). Saves instantly.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {submitted.filter((c) => stageOf(c) === 'shortlisted').length} shortlisted
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {submitted.filter((c) => stageOf(c) !== 'none').length}/{submitted.length} placed
                </Badge>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={exportShortlistCsv}>
                  <Download className="h-3.5 w-3.5" /> Export shortlist CSV
                </Button>
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2">
              {RECRUITMENT_STAGES.map(({ key, label, color, bg, border }) => {
                const items = submitted.filter((c) => stageOf(c) === key)
                return (
                  <div
                    key={key}
                    className="flex w-64 shrink-0 flex-col"
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const dragged = submitted.find((c) => (c.userId || c.id) === draggingKey)
                      setDraggingKey(null)
                      if (dragged) void moveStage(dragged, key)
                    }}
                  >
                    <div className={`flex items-center gap-2 rounded-t-lg border ${border} ${bg} px-3 py-2`}>
                      <span className={`text-sm font-semibold ${color}`}>{label}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>
                    </div>
                    <div className={`min-h-40 flex-1 border border-t-0 ${border} rounded-b-lg bg-card/50 max-h-[28rem] overflow-y-auto`}>
                      {items.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">Drop candidates here</div>
                      ) : (
                        <div className="p-2 space-y-2">
                          {items.map((c) => {
                            const k = c.userId || c.id
                            return (
                              <div
                                key={k}
                                draggable
                                onDragStart={(e) => { setDraggingKey(k); e.dataTransfer.effectAllowed = 'move' }}
                                onDragEnd={() => setDraggingKey(null)}
                                className={`cursor-grab active:cursor-grabbing rounded-md border border-border/60 bg-card p-2.5 space-y-1 hover:shadow-sm transition-shadow ${draggingKey === k ? 'opacity-50' : ''}`}
                                title="Drag to another stage"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium truncate">{c.name}</p>
                                  {savingStage === k && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                                <div className="flex items-center gap-1.5 pt-0.5">
                                  {(c.scorePct ?? c.score) != null && (
                                    <Badge variant={c.passed ? 'success' : 'secondary'} className="text-[10px]">
                                      {c.scorePct ?? c.score}%
                                    </Badge>
                                  )}
                                  {c.passed === true && <Badge variant="success" className="text-[10px]">Passed</Badge>}
                                  {c.passed === false && <Badge variant="danger" className="text-[10px]">Below cutoff</Badge>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
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

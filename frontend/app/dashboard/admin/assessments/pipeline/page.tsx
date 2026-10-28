'use client'
import { formatDate } from '@/lib/format-datetime'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { PageHeader, StatCard, Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { useAdminT } from '@/lib/i18n/admin'

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
  { key: 'invited' as const, label: 'Invited', icon: Mail, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
  { key: 'inProgress' as const, label: 'In progress', icon: Play, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { key: 'completed' as const, label: 'Completed', icon: CheckCircle2, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' },
  { key: 'passed' as const, label: 'Passed', icon: Trophy, color: 'text-green-700 dark:text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  { key: 'failed' as const, label: 'Failed', icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
] as const

/** Drag-and-drop recruitment board columns. 'none' holds everyone not yet moved. */
const RECRUITMENT_STAGES = [
  { key: 'none', label: 'New / unstaged', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' },
  { key: 'shortlisted', label: 'Shortlisted', color: 'text-primary', bg: 'bg-primary/5', border: 'border-primary/20' },
  { key: 'hr', label: 'HR round', color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  { key: 'technical', label: 'Technical round', color: 'text-primary', bg: 'bg-primary/15', border: 'border-primary/40' },
  { key: 'offer', label: 'Offer', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  { key: 'hold', label: 'On hold', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { key: 'rejected', label: 'Rejected', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
] as const

type RecruitStageKey = (typeof RECRUITMENT_STAGES)[number]['key']

export default function PipelinePage() {
  const gate = usePageGuard('tenant_admin')
  const addToast = useToast()
  const { t } = useAdminT()

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
      addToast({ type: 'error', title: t('pipeline.cannotMove'), message: t('pipeline.noAccount') })
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
      addToast({ type: 'error', title: e instanceof Error ? e.message : t('pipeline.saveFailed') })
    } finally {
      setSavingStage(null)
    }
  }

  const exportShortlistCsv = () => {
    const rows = submitted
      .filter((c) => stageOf(c) !== 'none')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (rows.length === 0) {
      addToast({ type: 'info', title: t('pipeline.noneMoved') })
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
      .catch(err => addToast({ type: 'error', title: err.message || t('pipeline.loadFailed') }))
      .finally(() => setLoadingPipeline(false))
  }, [selectedExamId, addToast])

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        illustration="assessment"
        className="mb-0"
        title={t('pipeline.title')}
        description={t('pipeline.description')}
        icon={<LayoutDashboard />}
      />

      {/* Exam selector */}
      <Panel className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <span className="shrink-0 text-sm font-medium text-muted-foreground">{t('pipeline.assessment')}</span>
          <Select value={selectedExamId} onValueChange={setSelectedExamId}>
            <SelectTrigger aria-label={t('pipeline.assessment')}>
              <SelectValue placeholder={loadingExams ? 'Loading...' : 'Select an assessment'} />
            </SelectTrigger>
            <SelectContent>
              {exams.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Panel>

      {/* Empty state: no exam selected */}
      {!selectedExamId && (
        <EmptyState variant="search" title={t('pipeline.pick')} description={t('pipeline.pickDesc')} />
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
            <StatCard label={t('pipeline.totalInvited')} value={pipeline.stats.total} icon={<Users />} />
            <StatCard label={t('pipeline.completionRate')} value={`${pipeline.stats.total > 0 ? Math.round(((pipeline.stats.completed + pipeline.stats.passed + pipeline.stats.failed) / pipeline.stats.total) * 100) : 0}%`} icon={<TrendingUp />} />
            <StatCard label={t('pipeline.passRate')} value={`${pipeline.stats.passRate}%`} icon={<Trophy />} />
            <StatCard label={t('pipeline.avgScore')} value={`${pipeline.stats.avgScore}%`} icon={<BarChart3 />} />
          </div>

          {/* Kanban columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {STAGE_CONFIG.map(({ key, label, icon: Icon, color, bg, border }) => {
              const items = pipeline.stages[key]
              return (
                <div key={key} className="flex flex-col">
                  <div className={`flex items-center gap-2 rounded-t-2xl border ${border} ${bg} px-3 py-2`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                    <span className={`text-sm font-semibold ${color}`}>{t(`pipeline.stage.${key}`) || label}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>
                  </div>
                  <div className={`flex-1 border border-t-0 ${border} rounded-b-2xl bg-card/50 max-h-96 overflow-y-auto`}>
                    {items.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">{t('pipeline.noCandidates')}</div>
                    ) : (
                      <div className="p-2 space-y-2">
                        {items.map(c => (
                          <div key={c.id} className="rounded-xl border border-border/60 bg-card p-2.5 space-y-1 hover:shadow-sm transition-shadow">
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
                                ? `Completed ${formatDate(c.completedAt)}`
                                : c.startedAt
                                ? `Started ${formatDate(c.startedAt)}`
                                : `Invited ${formatDate(c.invitedAt)}`}
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
                <h2 className="text-lg font-semibold">{t('pipeline.recruitment')}</h2>
                <p className="text-xs text-muted-foreground">
                  {t('pipeline.dragHint')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {t('pipeline.shortlistedCount', { n: submitted.filter((c) => stageOf(c) === 'shortlisted').length })}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {t('pipeline.placedCount', { placed: submitted.filter((c) => stageOf(c) !== 'none').length, total: submitted.length })}
                </Badge>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={exportShortlistCsv}>
                  <Download className="h-3.5 w-3.5" /> {t('pipeline.exportCsv')}
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
                    <div className={`flex items-center gap-2 rounded-t-2xl border ${border} ${bg} px-3 py-2`}>
                      <span className={`text-sm font-semibold ${color}`}>{t(`pipeline.rstage.${key}`) || label}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>
                    </div>
                    <div className={`min-h-40 flex-1 border border-t-0 ${border} rounded-b-2xl bg-card/50 max-h-[28rem] overflow-y-auto`}>
                      {items.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">{t('pipeline.dropHere')}</div>
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
                                className={`cursor-grab active:cursor-grabbing rounded-xl border border-border/60 bg-card p-2.5 space-y-1 hover:shadow-sm transition-shadow ${draggingKey === k ? 'opacity-50' : ''}`}
                                title={t('pipeline.dragTitle')}
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
                                  {c.passed === true && <Badge variant="success" className="text-[10px]">{t('pipeline.passed')}</Badge>}
                                  {c.passed === false && <Badge variant="danger" className="text-[10px]">{t('pipeline.belowCutoff')}</Badge>}
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
            <EmptyState
              illustration="assessment"
              title={t('pipeline.noCandidatesYet')}
              description={t('pipeline.noCandidatesYetDesc')}
              actionLabel={t('pipeline.goToAssessments')}
              actionHref="/dashboard/admin/assessments"
            />
          )}
        </>
      )}
    </div>
  )
}

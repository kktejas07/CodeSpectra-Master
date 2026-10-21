'use client'

import { Suspense, use, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Briefcase, Pencil, Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { ErrorState, LoadingRows, NativeSelect, Segmented } from '@/components/hiring/ui'
import { PipelineBoard } from '@/components/hiring/board/pipeline-board'
import { ApplicationsList } from '@/components/hiring/board/list-view'
import { IntakePanel } from '@/components/hiring/board/intake-panel'
import { AnalyticsView } from '@/components/hiring/analytics-view'
import { ApplicationDrawer } from '@/components/hiring/application-drawer'
import { ActionDialog, approveMove, type ActionRequest } from '@/components/hiring/actions'
import { atsSend, errorMessage, useAts } from '@/components/hiring/lib/api'
import { boardTotals, filterBoard, moveOnBoard } from '@/components/hiring/lib/board'
import { JOB_STATUS_LABELS, JOB_STATUS_VARIANT, WORK_MODE_LABELS } from '@/components/hiring/lib/labels'
import type { AnalyticsResponse, BoardResponse } from '@/components/hiring/lib/types'
import { useT } from '@/lib/i18n/client'

type Tab = 'board' | 'list' | 'intake' | 'analytics'
const TABS: Tab[] = ['board', 'list', 'intake', 'analytics']

export default function HiringJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={<LoadingRows rows={5} />}>
      <JobBoard id={id} />
    </Suspense>
  )
}

function JobBoard({ id }: { id: string }) {
  const { t: tr } = useT()
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const addToast = useToast()
  const tabParam = search.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'board'
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false })

  const board = useAts<BoardResponse>(`/api/ats/jobs/${encodeURIComponent(id)}/board`)
  const analytics = useAts<AnalyticsResponse>(tab === 'analytics' ? `/api/ats/analytics?job_id=${encodeURIComponent(id)}` : null)
  const [q, setQ] = useState('')
  const [minScore, setMinScore] = useState('')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [openApp, setOpenApp] = useState<string | null>(search.get('app'))
  const [action, setAction] = useState<ActionRequest | null>(null)
  const [rescreening, setRescreening] = useState(false)

  const job = board.data?.job
  const columns = useMemo(() => {
    const cols = board.data?.stages ?? []
    const visible = showClosed ? cols : cols.filter((c) => c.stage.type !== 'rejected')
    return filterBoard(visible, { q, minScore: minScore ? Number(minScore) : null, pendingOnly })
  }, [board.data, q, minScore, pendingOnly, showClosed])
  const totals = boardTotals(board.data?.stages ?? [])
  const stages = job?.pipeline ?? []

  const approve = async (appId: string, accept: boolean) => {
    try {
      await approveMove(appId, accept)
      addToast({ type: 'success', title: accept ? tr('hiring.moveApproved') : tr('hiring.moveDeclined') })
      board.reload()
    } catch (e) {
      addToast({ type: 'error', title: tr('hiring.thatDidntWork'), message: errorMessage(e) })
    }
  }

  const rescreen = async (ids: string[]) => {
    setRescreening(true)
    try {
      await atsSend(`/api/ats/jobs/${encodeURIComponent(id)}/rescreen`, 'POST', { application_ids: ids })
      addToast({ type: 'success', title: tr('hiring.rescreeningCountCandidates', { count: ids.length }) })
      board.reload()
    } catch (e) {
      addToast({ type: 'error', title: tr('hiring.couldNotRescreen'), message: errorMessage(e) })
    } finally {
      setRescreening(false)
    }
  }

  return (
    <HiringShell
      title={job?.title ?? tr('hiring.job')}
      description={
        job ? (
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={JOB_STATUS_VARIANT[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
            <span>{[job.location, job.work_mode && WORK_MODE_LABELS[job.work_mode], `${job.openings} opening${job.openings === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
            <span className="tabular-nums">{tr('hiring.countCandidates', { count: totals.total })}</span>
            {totals.pending > 0 && <span className="tabular-nums text-primary">{tr('hiring.pendingWaitingForApproval', { pending: totals.pending })}</span>}
          </span>
        ) : undefined
      }
      icon={<Briefcase />}
      actions={
        job && (
          <>
            <Button variant="outline" className="rounded-full" onClick={() => setTab('intake')}><UserPlus aria-hidden />{' '}{tr('hiring.addCandidates')}</Button>
            <Button variant="outline" asChild className="rounded-full"><Link href={`/dashboard/hiring/jobs/${id}/edit`}><Pencil aria-hidden />{' '}{tr('hiring.editJob')}</Link></Button>
          </>
        )
      }
    >
      <QueryGate loading={board.loading} error={board.error} hasData={!!board.data} onRetry={board.reload} />
      {board.data && job && (
        <div className="space-y-5">
          <Segmented<Tab>
            label={tr('hiring.jobViews')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'board', label: tr('hiring.board') },
              { value: 'list', label: tr('hiring.list'), count: totals.total },
              { value: 'intake', label: tr('hiring.addCandidates') },
              { value: 'analytics', label: tr('hiring.analytics') },
            ]}
          />

          {(tab === 'board' || tab === 'list') && (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('hiring.nameEmailSkillOrTag')} aria-label={tr('hiring.searchCandidates')} className="pl-9" />
                </div>
                <NativeSelect
                  aria-label={tr('hiring.minimumMatchScore')}
                  value={minScore}
                  onChange={setMinScore}
                  className="sm:w-44"
                  placeholder={tr('hiring.anyMatchScore')}
                  options={[{ value: '50', label: tr('hiring.score50') }, { value: '70', label: tr('hiring.score70') }, { value: '85', label: tr('hiring.score85') }]}
                />
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Switch checked={pendingOnly} onCheckedChange={setPendingOnly} aria-label={tr('hiring.onlyWaitingForApproval')} />{' '}{tr('hiring.waitingForApproval')}</label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Switch checked={showClosed} onCheckedChange={setShowClosed} aria-label={tr('hiring.showRejected')} />{' '}{tr('hiring.showRejected')}</label>
              </div>

              {totals.total === 0 ? (
                <EmptyState
                  illustration="resume"
                  title={tr('hiring.noCandidatesYet')}
                  description={tr('hiring.shareTheApplyLinkDropIn276')}
                  actionLabel={tr('hiring.addCandidates')}
                  onAction={() => setTab('intake')}
                />
              ) : tab === 'board' ? (
                <PipelineBoard
                  columns={columns}
                  onOpen={(a) => setOpenApp(a.id)}
                  onRequestMove={(a, to) => setAction({ kind: 'move', ids: [a.id], to, label: a.candidate?.name })}
                  onReject={(a) => setAction({ kind: 'reject', ids: [a.id], label: a.candidate?.name })}
                  onApprove={(a, accept) => approve(a.id, accept)}
                />
              ) : (
                <ApplicationsList
                  columns={columns}
                  onOpen={(a) => setOpenApp(a.id)}
                  onBulkMove={(ids) => setAction({ kind: 'move', ids })}
                  onBulkReject={(ids) => setAction({ kind: 'reject', ids })}
                  onBulkRescreen={rescreen}
                  rescreening={rescreening}
                />
              )}
            </>
          )}

          {tab === 'intake' && <IntakePanel job={job} onAdded={board.reload} />}

          {tab === 'analytics' && (
            analytics.error ? <ErrorState message={analytics.error.message} onRetry={analytics.reload} />
              : !analytics.data ? <LoadingRows rows={4} />
                : <AnalyticsView data={analytics.data} />
          )}
        </div>
      )}

      <ActionDialog
        request={action}
        stages={stages}
        onClose={() => setAction(null)}
        onDone={({ kind, ids, to, failed }) => {
          setAction(null)
          if (kind === 'move' && to) board.setData((d) => (d ? { ...d, stages: ids.reduce((cols, appId) => moveOnBoard(cols, appId, to), d.stages) } : d))
          addToast({
            type: failed ? 'warning' : 'success',
            title: kind === 'move' ? tr('hiring.moved') : kind === 'reject' ? tr('hiring.rejected') : tr('hiring.onHold'),
            message: failed ? tr('hiring.failedCouldNotBeChangedReloadb45', { failed }) : undefined,
          })
          board.reload()
        }}
      />
      <ApplicationDrawer appId={openApp} onClose={() => setOpenApp(null)} onChanged={board.reload} />
    </HiringShell>
  )
}

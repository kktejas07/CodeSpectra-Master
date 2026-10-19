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
      addToast({ type: 'success', title: accept ? 'Move approved' : 'Move declined' })
      board.reload()
    } catch (e) {
      addToast({ type: 'error', title: 'That didn’t work', message: errorMessage(e) })
    }
  }

  const rescreen = async (ids: string[]) => {
    setRescreening(true)
    try {
      await atsSend(`/api/ats/jobs/${encodeURIComponent(id)}/rescreen`, 'POST', { application_ids: ids })
      addToast({ type: 'success', title: `Rescreening ${ids.length} candidate${ids.length === 1 ? '' : 's'}` })
      board.reload()
    } catch (e) {
      addToast({ type: 'error', title: 'Could not rescreen', message: errorMessage(e) })
    } finally {
      setRescreening(false)
    }
  }

  return (
    <HiringShell
      title={job?.title ?? 'Job'}
      description={
        job ? (
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={JOB_STATUS_VARIANT[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
            <span>{[job.location, job.work_mode && WORK_MODE_LABELS[job.work_mode], `${job.openings} opening${job.openings === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
            <span className="tabular-nums">· {totals.total} candidate{totals.total === 1 ? '' : 's'}</span>
            {totals.pending > 0 && <span className="tabular-nums text-primary">· {totals.pending} waiting for approval</span>}
          </span>
        ) : undefined
      }
      icon={<Briefcase />}
      actions={
        job && (
          <>
            <Button variant="outline" className="rounded-full" onClick={() => setTab('intake')}><UserPlus aria-hidden /> Add candidates</Button>
            <Button variant="outline" asChild className="rounded-full"><Link href={`/dashboard/hiring/jobs/${id}/edit`}><Pencil aria-hidden /> Edit job</Link></Button>
          </>
        )
      }
    >
      <QueryGate loading={board.loading} error={board.error} hasData={!!board.data} onRetry={board.reload} />
      {board.data && job && (
        <div className="space-y-5">
          <Segmented<Tab>
            label="Job views"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'list', label: 'List', count: totals.total },
              { value: 'intake', label: 'Add candidates' },
              { value: 'analytics', label: 'Analytics' },
            ]}
          />

          {(tab === 'board' || tab === 'list') && (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, skill or tag" aria-label="Search candidates" className="pl-9" />
                </div>
                <NativeSelect
                  aria-label="Minimum match score"
                  value={minScore}
                  onChange={setMinScore}
                  className="sm:w-44"
                  placeholder="Any match score"
                  options={[{ value: '50', label: 'Score 50+' }, { value: '70', label: 'Score 70+' }, { value: '85', label: 'Score 85+' }]}
                />
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Switch checked={pendingOnly} onCheckedChange={setPendingOnly} aria-label="Only waiting for approval" /> Waiting for approval
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Switch checked={showClosed} onCheckedChange={setShowClosed} aria-label="Show rejected" /> Show rejected
                </label>
              </div>

              {totals.total === 0 ? (
                <EmptyState
                  illustration="resume"
                  title="No candidates yet"
                  description="Share the apply link, drop in résumés or pick people from your talent pool."
                  actionLabel="Add candidates"
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
            title: kind === 'move' ? 'Moved' : kind === 'reject' ? 'Rejected' : 'On hold',
            message: failed ? `${failed} could not be changed. Reload to see the latest.` : undefined,
          })
          board.reload()
        }}
      />
      <ApplicationDrawer appId={openApp} onClose={() => setOpenApp(null)} onChanged={board.reload} />
    </HiringShell>
  )
}

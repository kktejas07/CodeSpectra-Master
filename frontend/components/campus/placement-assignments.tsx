'use client'

/** Company-practice assignments from the placement copilot, with who finished them (CORE-048). */
import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress } from '@/components/ui/progress'
import { SkeletonList } from '@/components/ui/skeleton-boneyard'
import { useConsole } from './console-context'
import { fmtDate } from './shared'
import { useT } from '@/lib/i18n/client'

interface AssignmentRow {
  id: string; test: string; created_at: string
  total: number; completed: number; started: number; pending: number
  pending_students: Array<{ student_id: string; name: string; started: boolean }>
}

export function PlacementAssignments() {
  const { t: tr } = useT()
  const { url } = useConsole()
  const [items, setItems] = useState<AssignmentRow[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    setItems(null); setError(false)
    fetch(url('/api/campus/assignments'), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: AssignmentRow[] }) => { if (live) setItems(d.items) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [url])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{tr('career.assignmentsHint')}</p>
      {error ? <EmptyState compact illustration="error" title={tr('career.couldntLoadAssignments')} description={tr('career.tryAgainInAMoment')} />
        : !items ? <SkeletonList count={3} />
        : items.length === 0 ? <EmptyState compact illustration="inbox" title={tr('career.noAssignments')} description={tr('career.noAssignmentsDesc')} />
        : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id}>
                <Panel className="space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2">
                      <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground">{a.test}</h3>
                        <p className="text-sm text-muted-foreground">{tr('career.assignedOn', { date: fmtDate(a.created_at) })}</p>
                      </div>
                    </div>
                    <p className="text-sm tabular-nums text-foreground">
                      {tr('career.completedOf', { done: a.completed, total: a.total })}
                      {a.started > 0 && <span className="text-muted-foreground"> · {tr('career.startedCount', { count: a.started })}</span>}
                    </p>
                  </div>
                  <Progress value={a.total ? Math.round((a.completed / a.total) * 100) : 0} aria-label={tr('career.completedOf', { done: a.completed, total: a.total })} />
                  {a.pending_students.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-foreground focus-visible:outline-2 focus-visible:outline-ring">{tr('career.notFinished')} ({a.pending})</summary>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {a.pending_students.map((s) => (
                          <li key={s.student_id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">
                            {s.name}{s.started && <span className="text-muted-foreground"> · {tr('career.inProgress')}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </Panel>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCheck, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/lib/toast-context'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { MatchScore, NativeSelect } from '@/components/hiring/ui'
import { approveMove, runBulk } from '@/components/hiring/actions'
import { errorMessage, useAts } from '@/components/hiring/lib/api'
import { timeAgo } from '@/components/hiring/lib/labels'
import type { ApprovalItem } from '@/components/hiring/lib/types'

export default function HiringApprovalsPage() {
  const addToast = useToast()
  const q = useAts<ApprovalItem[]>('/api/ats/approvals', 'approvals')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [jobFilter, setJobFilter] = useState('')
  const [busy, setBusy] = useState<null | 'approve' | 'decline' | string>(null)

  const items = q.data ?? []
  const jobs = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of items) m.set(a.job.id, a.job.title)
    return [...m.entries()].map(([value, label]) => ({ value, label }))
  }, [items])
  const list = items.filter((a) => !jobFilter || a.job.id === jobFilter)
  const selected = list.filter((a) => sel.has(a.application_id)).map((a) => a.application_id)

  const decide = async (ids: string[], accept: boolean, key: string) => {
    setBusy(key)
    const { failed, firstError } = await runBulk(ids, (id) => approveMove(id, accept))
    setBusy(null)
    const okCount = ids.length - failed
    if (okCount) {
      addToast({ type: failed ? 'warning' : 'success', title: `${okCount} ${accept ? 'approved' : 'declined'}`, message: failed ? `${failed} failed: ${firstError}` : undefined })
      const done = new Set(ids)
      q.setData((d) => (d ? d.filter((a) => !done.has(a.application_id)) : d))
      setSel(new Set())
      q.reload()
    } else {
      addToast({ type: 'error', title: 'That didn’t work', message: firstError ?? errorMessage(null) })
    }
  }

  return (
    <HiringShell
      title="Approvals"
      description="Moves the pipeline suggested and is waiting for you to confirm."
      icon={<CheckCheck />}
    >
      <QueryGate loading={q.loading} error={q.error} hasData={!!q.data} onRetry={q.reload} />
      {q.data && (
        items.length === 0 ? (
          <EmptyState illustration="success" title="You're all caught up" description="When a candidate passes a stage that needs your approval, it shows up here." />
        ) : (
          <div className="space-y-3">
            <div className="flex min-h-10 flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={selected.length === list.length && list.length > 0 ? true : selected.length ? 'indeterminate' : false}
                  onCheckedChange={(v) => setSel(v ? new Set(list.map((a) => a.application_id)) : new Set())}
                  aria-label="Select all"
                />
                {selected.length ? <span className="tabular-nums">{selected.length} selected</span> : 'Select all'}
              </label>
              {selected.length > 0 && (
                <>
                  <Button size="sm" onClick={() => decide(selected, true, 'approve')} disabled={!!busy}>
                    {busy === 'approve' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <CheckCircle2 aria-hidden />} Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decide(selected, false, 'decline')} disabled={!!busy}>
                    {busy === 'decline' ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <XCircle aria-hidden />} Decline
                  </Button>
                </>
              )}
              {jobs.length > 1 && (
                <NativeSelect aria-label="Filter by job" value={jobFilter} onChange={setJobFilter} placeholder="All jobs" className="ml-auto sm:w-56" options={jobs} />
              )}
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border/70 bg-card">
              {list.map((a) => {
                const id = a.application_id
                return (
                  <li key={id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Checkbox checked={sel.has(id)} onCheckedChange={() => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })} aria-label={`Select ${a.candidate.name}`} className="mt-1" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/dashboard/hiring/candidates/${a.candidate.id}?app=${id}`} className="truncate font-medium text-foreground hover:text-primary">{a.candidate.name}</Link>
                          {a.match != null && <MatchScore score={a.match} />}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          <Link href={`/dashboard/hiring/jobs/${a.job.id}`} className="hover:text-foreground">{a.job.title}</Link>
                          {' · '}{a.from?.name ?? 'Current stage'} → <span className={a.to?.type === 'rejected' ? 'font-medium text-red-700 dark:text-red-400' : 'font-medium text-foreground'}>{a.to?.name ?? 'Next stage'}</span>
                        </p>
                        {a.reason && <p className="mt-0.5 text-xs text-muted-foreground">{a.reason} · {timeAgo(a.suggested_at)}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2 pl-7 sm:pl-0">
                      <Button size="sm" onClick={() => decide([id], true, id + ':y')} disabled={!!busy}>
                        {busy === id + ':y' && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />} Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => decide([id], false, id + ':n')} disabled={!!busy}>
                        {busy === id + ':n' && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />} Decline
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      )}
    </HiringShell>
  )
}

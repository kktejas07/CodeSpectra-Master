'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Briefcase, Globe, MapPin, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { NativeSelect, Segmented } from '@/components/hiring/ui'
import { useAts } from '@/components/hiring/lib/api'
import { JOB_STATUS_LABELS, JOB_STATUS_VARIANT, WORK_MODE_LABELS, timeAgo } from '@/components/hiring/lib/labels'
import type { AtsClient, JobListItem } from '@/components/hiring/lib/types'
import type { JobStatus } from '@/lib/ats/contract'

type StatusFilter = JobStatus | 'all'

export default function HiringJobsPage() {
  const jobs = useAts<JobListItem[]>('/api/ats/jobs', 'jobs')
  const clients = useAts<AtsClient[]>('/api/ats/clients', 'clients')
  const [status, setStatus] = useState<StatusFilter>('open')
  const [clientId, setClientId] = useState('')
  const [q, setQ] = useState('')

  const all = jobs.data ?? []
  const clientName = useMemo(() => new Map((clients.data ?? []).map((c) => [c.id, c.name])), [clients.data])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length }
    for (const j of all) c[j.status] = (c[j.status] ?? 0) + 1
    return c
  }, [all])
  const list = all.filter(
    (j) =>
      (status === 'all' || j.status === status) &&
      (!clientId || j.client_id === clientId) &&
      (!q.trim() || `${j.title} ${j.location ?? ''} ${j.department ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())),
  )

  return (
    <HiringShell
      title="Jobs"
      description="Each job has its own pipeline, screening rules and apply link."
      icon={<Briefcase />}
      actions={
        <Button asChild className="rounded-full">
          <Link href="/dashboard/hiring/jobs/new"><Plus aria-hidden /> New job</Link>
        </Button>
      }
    >
      <QueryGate loading={jobs.loading} error={jobs.error} hasData={!!jobs.data} onRetry={jobs.reload} />
      {jobs.data && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Segmented<StatusFilter>
              label="Filter by status"
              value={status}
              onChange={setStatus}
              options={(['open', 'draft', 'on_hold', 'closed', 'filled', 'all'] as StatusFilter[]).map((s) => ({
                value: s,
                label: s === 'all' ? 'All' : JOB_STATUS_LABELS[s],
                count: counts[s] ?? 0,
              }))}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs" aria-label="Search jobs" className="pl-9 sm:w-56" />
              </div>
              {(clients.data?.length ?? 0) > 0 && (
                <NativeSelect
                  aria-label="Filter by client"
                  value={clientId}
                  onChange={setClientId}
                  placeholder="All clients"
                  className="sm:w-48"
                  options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                />
              )}
            </div>
          </div>

          {all.length === 0 ? (
            <EmptyState
              scene="hiring-team"
              title="Create your first job"
              description="Add the role, pick a pipeline template and share the apply link. Candidates are screened as they come in."
              actionLabel="New job"
              actionHref="/dashboard/hiring/jobs/new"
            />
          ) : list.length === 0 ? (
            <EmptyState variant="search" title="No jobs match" description="Try another status, client or search." actionLabel="Show all jobs" onAction={() => { setStatus('all'); setClientId(''); setQ('') }} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {list.map((j) => {
                const total = j.counts?.total ?? 0
                const stages = (j.pipeline ?? []).filter((s) => s.type !== 'rejected')
                return (
                  <Panel key={j.id} interactive className="relative flex flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/dashboard/hiring/jobs/${j.id}`} className="line-clamp-2 font-semibold text-foreground after:absolute after:inset-0 after:rounded-3xl hover:text-primary focus-visible:outline-none">
                          {j.title}
                        </Link>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {(j.client_id && clientName.get(j.client_id)) || (j.client_id ? 'Client' : 'In-house')}
                        </p>
                      </div>
                      <Badge variant={JOB_STATUS_VARIANT[j.status]}>{JOB_STATUS_LABELS[j.status]}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {j.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{j.location}</span>}
                      {j.work_mode && <span>{WORK_MODE_LABELS[j.work_mode]}</span>}
                      <span className="tabular-nums">{j.openings} opening{j.openings === 1 ? '' : 's'}</span>
                      {j.is_public && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" aria-hidden />Public</span>}
                    </div>
                    <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Candidates per stage">
                      {stages.map((s) => (
                        <li key={s.id} className="rounded-lg bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                          {s.name} <span className="font-semibold tabular-nums text-foreground">{j.counts?.by_stage?.[s.id] ?? 0}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
                      <span className="tabular-nums"><span className="font-semibold text-foreground">{total}</span> candidate{total === 1 ? '' : 's'}</span>
                      <span>
                        {j.pending_approvals ? <span className="font-medium text-primary">{j.pending_approvals} to approve · </span> : null}
                        Updated {timeAgo(j.updated_at)}
                      </span>
                    </div>
                  </Panel>
                )
              })}
            </div>
          )}
        </div>
      )}
    </HiringShell>
  )
}

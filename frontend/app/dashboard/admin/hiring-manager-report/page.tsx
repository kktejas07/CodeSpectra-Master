'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import type { APIUser } from '@/lib/route-auth'
import { PageHeader, StatCard } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { RefreshCw, Users, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { OUTCOME_LABELS, OUTCOME_STATUSES, type OutcomeStatus } from '@/lib/hiring-outcomes'

interface Candidate {
  id: string
  name: string
  role: string
  scores: Record<string, number>
  composite: number
  status: string
}

export default function HiringManagerReportPage() {
  const gate = usePageGuard('tenant_admin')
  const addToast = useToast()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  /** Hiring outcomes recorded on the results pages, by status. */
  const [outcomes, setOutcomes] = useState<{ counts: Record<OutcomeStatus, number>; total: number } | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/hiring-reports', { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setCandidates(json.data || [])
      const oRes = await fetch('/api/admin/hiring-outcomes?summary=1', { credentials: 'include' })
      if (oRes.ok) setOutcomes(await oRes.json())
    } catch { addToast({ type: 'error', title: "Couldn't load the hiring report", message: 'Refresh the page or try again in a moment.' }) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const columns: DataTableColumn<Candidate>[] = [
    { key: 'name', header: 'Candidate', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'role', header: 'Role', cell: (r) => r.role },
    { key: 'composite', header: 'Score', cell: (r) => <span className="font-semibold tabular-nums">{r.composite}%</span> },
    { key: 'status', header: 'Status', cell: (r) => r.status },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="relative isolate">
        <SoftGlow className="-inset-y-6 [mask-image:radial-gradient(ellipse_at_75%_45%,#000_30%,transparent_72%)]" />
        <PageHeader
          illustration="analytics"
          title="Hiring manager report"
          description="Candidates and their combined assessment score, ready to share with the hiring manager."
          icon={<FileText />}
          actions={<Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden />Refresh</Button>}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Candidates" value={candidates.length} icon={<Users />} />
        <StatCard
          label="Average score"
          value={candidates.length ? `${Math.round(candidates.reduce((a, c) => a + (Number(c.composite) || 0), 0) / candidates.length)}%` : '—'}
          icon={<Trophy />}
        />
      </div>

      {outcomes && (
        <div className="rounded-3xl border border-border/70 bg-card p-5">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            Hiring outcomes recorded <span className="tabular-nums">({outcomes.total})</span>
          </p>
          {outcomes.total === 0 ? (
            <p className="text-sm text-muted-foreground">None yet. Record them from a test’s results page (select candidates, then “Record outcome”).</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {OUTCOME_STATUSES.map((st) => (
                <Badge key={st} variant="outline" className="text-xs">{OUTCOME_LABELS[st]}: <span className="ml-1 tabular-nums">{outcomes.counts[st] ?? 0}</span></Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <DataTable columns={columns} data={candidates} searchKeys={['name', 'role']} loading={loading} emptyState={{ illustration: 'analytics' }} emptyMessage="No candidates yet. They appear here once people finish an assessment." />
      )}
    </div>
  )
}

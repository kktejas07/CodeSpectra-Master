'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import type { APIUser } from '@/lib/route-auth'
import { PageHeader, StatCard } from '@/components/app/page-kit'
import { RefreshCw, Users, Trophy } from 'lucide-react'

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
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/hiring-reports', { credentials: 'include' })
      const json = await res.json()
      setCandidates(json.data || [])
    } catch { /* ignore */ }
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
      <PageHeader
        title="Hiring manager report"
        description="Candidates and their combined assessment score, ready to share with the hiring manager."
        icon={<FileText />}
        actions={<Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden />Refresh</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Candidates" value={candidates.length} icon={<Users />} />
        <StatCard
          label="Average score"
          value={candidates.length ? `${Math.round(candidates.reduce((a, c) => a + (Number(c.composite) || 0), 0) / candidates.length)}%` : '—'}
          icon={<Trophy />}
        />
      </div>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <DataTable columns={columns} data={candidates} searchKeys={['name', 'role']} loading={loading} emptyMessage="No candidates yet. They appear here once people finish an assessment." />
      )}
    </div>
  )
}

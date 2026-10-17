'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Users, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { PageHeader, StatCard } from '@/components/app/page-kit'
import { RefreshCw, ClipboardCheck, Flag } from 'lucide-react'

interface ReviewTask {
  id: string
  title: string
  candidateName: string
  type: string
  score: number
  status: string
  flags: string[]
}

export default function SMEReviewPage() {
  const gate = usePageGuard('tenant_admin')
  const [tasks, setTasks] = useState<ReviewTask[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/sme-reviews', { credentials: 'include' })
      const json = await res.json()
      setTasks(json.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const columns: DataTableColumn<ReviewTask>[] = [
    { key: 'title', header: 'Task', cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'candidate', header: 'Candidate', cell: (r) => r.candidateName },
    { key: 'type', header: 'Type', cell: (r) => <Badge variant="outline">{r.type}</Badge> },
    { key: 'score', header: 'Score', cell: (r) => <span className="font-semibold tabular-nums">{r.score}/100</span> },
    { key: 'status', header: 'Status', cell: (r) => r.status },
    { key: 'flags', header: 'Flags', cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {(r.flags || []).map(f => <Badge key={f} variant="outline" className="border-red-500/30 bg-red-500/10 text-[11px] text-red-700 dark:text-red-400">{f}</Badge>)}
      </div>
    )},
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expert review and grading"
        description="Written and design answers waiting for a subject-matter expert to mark."
        icon={<Users />}
        actions={<Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden />Refresh</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Review tasks" value={tasks.length} icon={<ClipboardCheck />} />
        <StatCard label="With flags" value={tasks.filter((t) => (t.flags || []).length > 0).length} icon={<Flag />} />
      </div>

      {loading ? (
        <SkeletonTable />
      ) : (
        <DataTable columns={columns} data={tasks} searchKeys={['title', 'candidateName']} loading={loading} emptyMessage="No review tasks. Submissions needing manual review will appear here." />
      )}
    </div>
  )
}

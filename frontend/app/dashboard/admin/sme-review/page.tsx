'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Users, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'

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
    { key: 'score', header: 'Score', cell: (r) => <span className="font-bold">{r.score}/100</span> },
    { key: 'status', header: 'Status', cell: (r) => r.status },
    { key: 'flags', header: 'Flags', cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {(r.flags || []).map(f => <Badge key={f} className="text-[10px] bg-red-500/20 text-red-700">{f}</Badge>)}
      </div>
    )},
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">SME Review & Grading</h1>
          <p className="text-muted-foreground text-sm mt-1">{tasks.length} review tasks</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>Refresh</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading review tasks...
        </div>
      ) : (
        <DataTable columns={columns} data={tasks} searchKeys={['title', 'candidateName']} loading={loading} emptyMessage="No review tasks. Data is populated from SME assignments." />
      )}
    </div>
  )
}

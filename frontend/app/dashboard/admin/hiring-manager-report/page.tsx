'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import type { APIUser } from '@/lib/route-auth'

interface Candidate {
  id: string
  name: string
  role: string
  scores: Record<string, number>
  composite: number
  status: string
}

export default function HiringManagerReportPage() {
  const gate = usePageGuard('superadmin')
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
    { key: 'composite', header: 'Score', cell: (r) => <span className="font-bold">{r.composite}%</span> },
    { key: 'status', header: 'Status', cell: (r) => r.status },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Hiring Manager Report</h1>
          <p className="text-muted-foreground text-sm mt-1">{candidates.length} candidates</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>Refresh</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...
        </div>
      ) : (
        <DataTable columns={columns} data={candidates} searchKeys={['name', 'role']} loading={loading} emptyMessage="No candidates. Data is populated from assessment results." />
      )}
    </div>
  )
}

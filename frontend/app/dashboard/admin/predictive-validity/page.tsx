'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { BarChart3, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { PageHeader, StatCard } from '@/components/app/page-kit'
import { RefreshCw, Users } from 'lucide-react'

interface ValidityStudy {
  id: string
  assessmentName: string
  correlation: number
  sampleSize: number
  discipline: string
  region: string
}

export default function PredictiveValidityPage() {
  const gate = usePageGuard('superadmin')
  const [data, setData] = useState<ValidityStudy[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/predictive-validity', { credentials: 'include' })
      const json = await res.json()
      setData(json.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const columns: DataTableColumn<ValidityStudy>[] = [
    { key: 'assessmentName', header: 'Assessment', cell: (r) => <span className="font-medium">{r.assessmentName}</span> },
    { key: 'discipline', header: 'Discipline', cell: (r) => r.discipline },
    { key: 'region', header: 'Region', cell: (r) => r.region ?? 'Global' },
    { key: 'correlation', header: 'Correlation', cell: (r) => <span className="font-semibold tabular-nums">{r.correlation?.toFixed(2)}</span> },
    { key: 'sampleSize', header: 'Sample size', cell: (r) => <span className="tabular-nums">{r.sampleSize}</span> },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Predictive validity and adverse impact"
        description="How well assessment scores predict on-the-job results, by discipline and region."
        icon={<BarChart3 />}
        actions={<Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden />Refresh</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Studies" value={data.length} icon={<BarChart3 />} />
        <StatCard label="People in all studies" value={data.reduce((a, d) => a + (Number(d.sampleSize) || 0), 0).toLocaleString()} icon={<Users />} />
      </div>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <DataTable columns={columns} data={data} searchKeys={['assessmentName', 'discipline']} loading={loading} emptyMessage="No studies yet. They appear once enough assessment results are linked to hiring outcomes." />
      )}
    </div>
  )
}

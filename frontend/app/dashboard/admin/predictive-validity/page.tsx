'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { BarChart3, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'

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
    { key: 'correlation', header: 'Correlation', cell: (r) => <span className="font-bold">{r.correlation?.toFixed(2)}</span> },
    { key: 'sampleSize', header: 'Sample Size', cell: (r) => r.sampleSize },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Predictive Validity & Adverse Impact</h1>
          <p className="text-muted-foreground text-sm mt-1">{data.length} studies</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>Refresh</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...
        </div>
      ) : (
        <DataTable columns={columns} data={data} searchKeys={['assessmentName', 'discipline']} loading={loading} emptyMessage="No studies. Data is populated from assessment analytics." />
      )}
    </div>
  )
}

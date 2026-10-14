'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Loader2, Trash2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'

interface Resume {
  id: string
  file_name: string
  file_size: number
  status: string
  skills: string[]
  created_at: string
}

export default function AdminResumesPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/resumes', { credentials: 'include' })
      const json = await res.json()
      setResumes(json.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/resumes/${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} resume${ids.length !== 1 ? 's' : ''} deleted` })
    setResumes(prev => prev.filter(r => !ids.includes(r.id)))
  }

  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)}KB` : `${(bytes/1048576).toFixed(1)}MB`

  const columns: DataTableColumn<Resume>[] = [
    { key: 'name', header: 'File', cell: (r) => <span className="font-medium">{r.file_name}</span> },
    { key: 'size', header: 'Size', cell: (r) => <span className="text-xs text-muted-foreground">{formatSize(r.file_size || 0)}</span> },
    { key: 'status', header: 'Status', cell: (r) => (
      <Badge className={r.status === 'processed' ? 'bg-green-500/20 text-green-700' : 'bg-yellow-500/20 text-yellow-700'}>
        {r.status || 'pending'}
      </Badge>
    )},
    { key: 'skills', header: 'Skills', cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {(r.skills || []).slice(0, 4).map(s => <Badge key={s} className="text-[10px] bg-muted">{s}</Badge>)}
      </div>
    )},
    { key: 'date', header: 'Uploaded', cell: (r) => <span className="text-xs text-muted-foreground">{r.created_at ? formatDate(r.created_at) : '—'}</span> },
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleDelete },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Resume Analysis</h1>
            <p className="text-muted-foreground text-sm">{resumes.length} resumes</p>
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonTable />
      ) : (
        <DataTable
          columns={columns}
          data={resumes}
          searchPlaceholder="Search resumes..."
          searchKeys={['file_name']}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No resumes yet."
        />
      )}
    </div>
  )
}

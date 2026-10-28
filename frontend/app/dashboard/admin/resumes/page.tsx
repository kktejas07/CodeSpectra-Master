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
import { PageHeader, StatCard } from '@/components/app/page-kit'
import { CheckCircle2, Clock } from 'lucide-react'
import { CareerAiCaps } from './career-ai-caps'

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

  const [loadError, setLoadError] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/resumes', { credentials: 'include' })
      if (!res.ok) throw new Error(`Failed to load resumes (${res.status})`)
      const json = await res.json()
      setResumes(json.data || [])
      setLoadError(false)
    } catch { setLoadError(true) }
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
    { key: 'size', header: 'Size', cell: (r) => <span className="text-xs tabular-nums text-muted-foreground">{formatSize(r.file_size || 0)}</span> },
    { key: 'status', header: 'Status', cell: (r) => (
      <Badge variant="outline" className={r.status === 'processed' ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'}>
        {r.status || 'pending'}
      </Badge>
    )},
    { key: 'skills', header: 'Skills', cell: (r) => (
      <div className="flex flex-wrap gap-1">
        {(r.skills || []).slice(0, 4).map(s => <Badge key={s} variant="secondary" className="text-[11px]">{s}</Badge>)}
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
      <PageHeader
        illustration="resume"
        title="Resume analysis"
        description="Resumes people have uploaded and the skills found in each one."
        icon={<FileText />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Resumes" value={resumes.length} icon={<FileText />} />
        <StatCard label="Processed" value={resumes.filter((r) => r.status === 'processed').length} icon={<CheckCircle2 />} />
        <StatCard label="Waiting" value={resumes.filter((r) => r.status !== 'processed').length} icon={<Clock />} />
      </div>

      <CareerAiCaps />

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
          emptyState={loadError ? { illustration: 'error', title: "Couldn't load resumes", description: 'Check your connection and try again.', actionLabel: 'Try again', onAction: () => void fetchData() } : { illustration: 'resume' }} emptyMessage="No resumes yet. They appear here when candidates upload one."
        />
      )}
    </div>
  )
}

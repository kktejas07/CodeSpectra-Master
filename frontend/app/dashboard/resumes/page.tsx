'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Upload, Loader2, Trash2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Resume {
  id: string
  file_name: string
  file_size: number
  status: string
  skills: string[]
  created_at: string
}

export default function MyResumesPage() {
  const gate = usePageGuard('user')
  const addToast = useToast()
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newResumeName, setNewResumeName] = useState('')

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

  const handleUpload = () => {
    setNewResumeName('')
    setAddModalOpen(true)
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
    { key: 'date', header: 'Uploaded', cell: (r) => <span className="text-xs text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</span> },
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
            <h1 className="text-3xl font-bold text-foreground">My Resumes</h1>
            <p className="text-muted-foreground text-sm">{resumes.length} resumes</p>
          </div>
        </div>
        <Button className="gap-2" onClick={handleUpload}>
          <Upload className="w-4 h-4" />Upload Resume
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading resumes...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={resumes}
          searchPlaceholder="Search resumes..."
          searchKeys={['file_name']}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No resumes. Upload one to get started."
        />
      )}

      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Resume</DialogTitle>
            <DialogDescription>Enter a name for your resume file.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>File Name</Label>
              <Input 
                value={newResumeName} 
                onChange={e => setNewResumeName(e.target.value)} 
                placeholder="e.g., John_Doe_Resume.pdf"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!newResumeName) {
                addToast({ type: 'error', title: 'File name is required' })
                return
              }
              csrfFetch('/api/resumes', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ file_name: newResumeName, file_size: 0, storage_url: '' }),
              }).then(() => { 
                fetchData(); 
                addToast({ type: 'success', title: 'Resume uploaded' });
                setAddModalOpen(false)
              })
              .catch(() => addToast({ type: 'error', title: 'Upload failed' }))
            }}>Save Resume</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

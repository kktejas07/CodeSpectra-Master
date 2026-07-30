'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trophy, Plus, Loader2, Trash2, Pencil } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

interface Codeathon {
  id: string
  title: string
  description: string
  startDate: string
  endDate: string
  status: string
  participants: number
  prizePool: string
  cert_template?: string
}

export default function AdminCodeathonsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [codeathons, setCodeathons] = useState<Codeathon[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Codeathon | null>(null)
  const [editForm, setEditForm] = useState({ title: '', startDate: '', endDate: '', cert_template: 'classic' })
  const [saving, setSaving] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/codeathons', { credentials: 'include' })
      const json = await res.json()
      setCodeathons(json.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/codeathons?id=${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} codeathon${ids.length !== 1 ? 's' : ''} deleted` })
    setCodeathons(prev => prev.filter(c => !ids.includes(c.id)))
  }

  const openEdit = (c: Codeathon) => {
    setEditForm({ title: c.title, startDate: c.startDate, endDate: c.endDate, cert_template: c.cert_template || 'classic' })
    setEditing(c)
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/codeathons/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error('Failed')
      addToast({ type: 'success', title: 'Codeathon updated' })
      setEditing(null)
      fetchData()
    } catch { addToast({ type: 'error', title: 'Failed to update codeathon' }) }
    finally { setSaving(false) }
  }

  const columns: DataTableColumn<Codeathon>[] = [
    { key: 'title', header: 'Title', cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'status', header: 'Status', cell: (r) => (
      <Badge className={r.status === 'active' ? 'bg-green-500/20 text-green-700' : r.status === 'upcoming' ? 'bg-blue-500/20 text-blue-700' : 'bg-gray-500/20 text-gray-700'}>
        {r.status}
      </Badge>
    )},
    { key: 'dates', header: 'Dates', cell: (r) => <span className="text-xs">{r.startDate ? new Date(r.startDate).toLocaleDateString() : 'N/A'} — {r.endDate ? new Date(r.endDate).toLocaleDateString() : 'N/A'}</span> },
    { key: 'participants', header: 'Participants', cell: (r) => r.participants },
    { key: 'prize', header: 'Prize Pool', cell: (r) => r.prizePool || '—' },
    { key: 'actions', header: '', cell: (r) => (
      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
    )},
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
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Codeathon Management</h1>
            <p className="text-muted-foreground text-sm">{codeathons.length} codeathons</p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => {
          const title = prompt('Codeathon title:')
          if (!title) return
          const startDate = prompt('Start date (YYYY-MM-DD):') || ''
          const endDate = prompt('End date (YYYY-MM-DD):') || ''
          csrfFetch('/api/codeathons', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ title, startDate, endDate, status: 'upcoming', cert_template: 'classic' }),
          }).then(() => { fetchData(); addToast({ type: 'success', title: 'Codeathon created' }) })
            .catch(() => addToast({ type: 'error', title: 'Failed to create codeathon' }))
        }}>
          <Plus className="w-4 h-4" />Add Codeathon
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading codeathons...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={codeathons}
          searchPlaceholder="Search codeathons..."
          searchKeys={['title']}
          filters={[{
            label: 'Status', key: 'status',
            options: [
              { label: 'Upcoming', value: 'upcoming' },
              { label: 'Active', value: 'active' },
              { label: 'Ended', value: 'ended' },
            ],
          }]}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No codeathons. Click 'Add Codeathon' to create one."
        />
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Edit Codeathon</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Certificate Template</Label>
                <select
                  value={editForm.cert_template}
                  onChange={(e) => setEditForm(f => ({ ...f, cert_template: e.target.value }))}
                  className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                >
                  <option value="classic">Classic (Gold/Serif)</option>
                  <option value="modern">Modern (Dark Gradient)</option>
                  <option value="minimal">Minimal (Monochrome)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

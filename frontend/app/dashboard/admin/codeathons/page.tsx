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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

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
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newCodeathon, setNewCodeathon] = useState({ title: '', startDate: '', endDate: '' })

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
      <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
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
          setNewCodeathon({ title: '', startDate: '', endDate: '' })
          setAddModalOpen(true)
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

      {/* Edit Modal (Existing) */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background rounded-xl shadow-lg border w-full max-w-md overflow-hidden">
            <div className="p-4 border-b bg-muted/30">
              <h3 className="font-semibold">Edit Codeathon</h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input value={editForm.startDate} onChange={e => setEditForm({...editForm, startDate: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input value={editForm.endDate} onChange={e => setEditForm({...editForm, endDate: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Certificate Template</Label>
                <select 
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={editForm.cert_template} 
                  onChange={e => setEditForm({...editForm, cert_template: e.target.value})}
                >
                  <option value="classic">Classic (Gold/Serif)</option>
                  <option value="modern">Modern (Dark Gradient)</option>
                  <option value="minimal">Minimal (Monochrome)</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t bg-muted/30 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Codeathon</DialogTitle>
            <DialogDescription>Create a new codeathon event.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input 
                value={newCodeathon.title} 
                onChange={e => setNewCodeathon({...newCodeathon, title: e.target.value})} 
                placeholder="Enter title"
              />
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input 
                value={newCodeathon.startDate} 
                onChange={e => setNewCodeathon({...newCodeathon, startDate: e.target.value})} 
                placeholder="YYYY-MM-DD"
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input 
                value={newCodeathon.endDate} 
                onChange={e => setNewCodeathon({...newCodeathon, endDate: e.target.value})} 
                placeholder="YYYY-MM-DD"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!newCodeathon.title) {
                addToast({ type: 'error', title: 'Title is required' })
                return
              }
              csrfFetch('/api/codeathons', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ ...newCodeathon, status: 'upcoming', cert_template: 'classic' }),
              }).then(() => { 
                fetchData(); 
                addToast({ type: 'success', title: 'Codeathon created' });
                setAddModalOpen(false)
              })
              .catch(() => addToast({ type: 'error', title: 'Failed to create codeathon' }))
            }}>Save Codeathon</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

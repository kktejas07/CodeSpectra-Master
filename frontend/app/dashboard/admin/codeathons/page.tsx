'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trophy, Plus, Loader2, Trash2, Pencil, Calendar, Users, Target, BookOpen, Settings, Eye } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface Problem {
  id: string
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  points: number
  description: string
}

interface Codeathon {
  id: string
  title: string
  description: string
  difficulty: string
  topics: string[]
  rules: string
  maxParticipants: number
  startDate: string
  endDate: string
  status: string
  participants: number
  prizePool: string
  cert_template?: string
  problems?: Problem[]
}

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Mixed']
const TOPIC_OPTIONS = [
  'Algorithms', 'Data Structures', 'Web Development', 'Mobile Development',
  'Machine Learning', 'DevOps', 'System Design', 'Database', 'Security', 'Open Innovation'
]

export default function AdminCodeathonsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [codeathons, setCodeathons] = useState<Codeathon[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Create sheet
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({
    title: '', description: '', difficulty: 'Medium', topics: [] as string[],
    rules: '', maxParticipants: 0, startDate: '', endDate: '', prizePool: '', cert_template: 'classic',
    event_type: 'individual', team_size_min: 2, team_size_max: 4, problem_visibility: 'during_contest'
  })

  // Edit sheet
  const [editing, setEditing] = useState<Codeathon | null>(null)
  const [editForm, setEditForm] = useState({
    title: '', description: '', difficulty: 'Medium', topics: [] as string[],
    rules: '', maxParticipants: 0, startDate: '', endDate: '', prizePool: '', cert_template: 'classic',
    event_type: 'individual', team_size_min: 2, team_size_max: 4, problem_visibility: 'during_contest'
  })

  // Problem management
  const [problemForm, setProblemForm] = useState<{ title: string; difficulty: 'Easy' | 'Medium' | 'Hard'; points: number; description: string }>({ title: '', difficulty: 'Medium', points: 100, description: '' })
  const [editingProblems, setEditingProblems] = useState<Problem[]>([])

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
    setEditForm({
      title: c.title, description: c.description || '', difficulty: c.difficulty || 'Medium',
      topics: c.topics || [], rules: c.rules || '', maxParticipants: c.maxParticipants || 0,
      startDate: c.startDate, endDate: c.endDate, prizePool: c.prizePool || '',
      cert_template: c.cert_template || 'classic',
      event_type: (c as any).event_type || 'individual',
      team_size_min: (c as any).team_size_min || 2,
      team_size_max: (c as any).team_size_max || 4,
      problem_visibility: (c as any).problem_visibility || 'during_contest',
    })
    setEditingProblems(c.problems || [])
    setEditing(c)
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await csrfFetch(`/api/codeathons/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, problems: editingProblems }),
      })
      if (!res.ok) throw new Error('Failed')
      addToast({ type: 'success', title: 'Codeathon updated' })
      setEditing(null)
      fetchData()
    } catch { addToast({ type: 'error', title: 'Failed to update codeathon' }) }
    finally { setSaving(false) }
  }

  const addProblem = () => {
    if (!problemForm.title.trim()) return
    setEditingProblems(prev => [...prev, { ...problemForm, id: crypto.randomUUID() }])
    setProblemForm({ title: '', difficulty: 'Medium', points: 100, description: '' })
  }

  const removeProblem = (id: string) => {
    setEditingProblems(prev => prev.filter(p => p.id !== id))
  }

  const toggleTopic = (topic: string, formType: 'create' | 'edit') => {
    if (formType === 'create') {
      setForm(prev => ({
        ...prev,
        topics: prev.topics.includes(topic)
          ? prev.topics.filter(t => t !== topic)
          : [...prev.topics, topic]
      }))
    } else {
      setEditForm(prev => ({
        ...prev,
        topics: prev.topics.includes(topic)
          ? prev.topics.filter(t => t !== topic)
          : [...prev.topics, topic]
      }))
    }
  }

  const handleCreate = async () => {
    if (!form.title.trim()) {
      addToast({ type: 'error', title: 'Title is required' })
      return
    }
    setSaving(true)
    try {
      const res = await csrfFetch('/api/codeathons', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...form, status: 'upcoming' }),
      })
      if (!res.ok) throw new Error('Failed')
      fetchData()
      addToast({ type: 'success', title: 'Codeathon created' })
      setCreateOpen(false)
      setForm({ title: '', description: '', difficulty: 'Medium', topics: [], rules: '', maxParticipants: 0, startDate: '', endDate: '', prizePool: '', cert_template: 'classic', event_type: 'individual', team_size_min: 2, team_size_max: 4, problem_visibility: 'during_contest' })
    } catch { addToast({ type: 'error', title: 'Failed to create codeathon' }) }
    finally { setSaving(false) }
  }

  const columns: DataTableColumn<Codeathon>[] = [
    { key: 'title', header: 'Title', cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'status', header: 'Status', cell: (r) => (
      <Badge className={r.status === 'active' ? 'bg-green-500/20 text-green-700' : r.status === 'upcoming' ? 'bg-blue-500/20 text-blue-700' : 'bg-gray-500/20 text-gray-700'}>
        {r.status}
      </Badge>
    )},
    { key: 'difficulty', header: 'Difficulty', cell: (r) => (
      <Badge variant="outline" className={r.difficulty === 'Hard' ? 'border-red-400 text-red-600' : r.difficulty === 'Easy' ? 'border-green-400 text-green-600' : 'border-yellow-400 text-yellow-600'}>
        {r.difficulty || 'Medium'}
      </Badge>
    )},
    { key: 'dates', header: 'Dates', cell: (r) => <span className="text-xs">{r.startDate ? new Date(r.startDate).toLocaleDateString() : 'N/A'} — {r.endDate ? new Date(r.endDate).toLocaleDateString() : 'N/A'}</span> },
    { key: 'participants', header: 'Participants', cell: (r) => `${r.participants || 0}${r.maxParticipants ? `/${r.maxParticipants}` : ''}` },
    { key: 'problems', header: 'Problems', cell: (r) => r.problems?.length || 0 },
    { key: 'prize', header: 'Prize Pool', cell: (r) => r.prizePool || '—' },
    { key: 'actions', header: '', cell: (r) => (
      <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
    )},
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleDelete },
  ]

  if (!gate.ready) return null

  const FormFields = ({ f, setF, prefix }: { f: typeof form; setF: React.Dispatch<React.SetStateAction<typeof form>>; prefix: string }) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input value={f.title} onChange={e => setF({...f, title: e.target.value})} placeholder="e.g. Spring HackFest 2026" />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={f.description} onChange={e => setF({...f, description: e.target.value})} rows={3} placeholder="Describe the codeathon..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Difficulty</Label>
          <Select value={f.difficulty} onValueChange={v => setF({...f, difficulty: v})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DIFFICULTIES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Max Participants</Label>
          <Input type="number" min={0} value={f.maxParticipants || ''} onChange={e => setF({...f, maxParticipants: Number(e.target.value) || 0})} placeholder="0 = unlimited" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Topics</Label>
        <div className="flex flex-wrap gap-1.5">
          {TOPIC_OPTIONS.map(t => (
            <button key={t} type="button" onClick={() => toggleTopic(t, prefix === 'edit' ? 'edit' : 'create')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${f.topics.includes(t) ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-primary/50'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Date</Label>
          <Input type="datetime-local" value={f.startDate} onChange={e => setF({...f, startDate: e.target.value})} />
        </div>
        <div className="space-y-2">
          <Label>End Date</Label>
          <Input type="datetime-local" value={f.endDate} onChange={e => setF({...f, endDate: e.target.value})} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Prize Pool</Label>
        <Input value={f.prizePool} onChange={e => setF({...f, prizePool: e.target.value})} placeholder="e.g. $5,000" />
      </div>
      <div className="space-y-2">
        <Label>Rules</Label>
        <Textarea value={f.rules} onChange={e => setF({...f, rules: e.target.value})} rows={3} placeholder="Code of conduct, judging criteria, etc." />
      </div>
      <div className="space-y-2">
        <Label>Certificate Template</Label>
        <Select value={f.cert_template} onValueChange={v => setF({...f, cert_template: v})}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="classic">Classic (Gold/Serif)</SelectItem>
            <SelectItem value="modern">Modern (Dark Gradient)</SelectItem>
            <SelectItem value="minimal">Minimal (Monochrome)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Event Type & Team Settings */}
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold mb-3">Event Format</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Event Type</Label>
            <Select value={f.event_type} onValueChange={v => setF({...f, event_type: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {f.event_type === 'individual' ? 'Each participant competes alone' : 'Participants form teams to compete'}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Problem Visibility</Label>
            <Select value={f.problem_visibility} onValueChange={v => setF({...f, problem_visibility: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="during_contest">Visible when contest starts</SelectItem>
                <SelectItem value="immediate">Visible immediately</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {f.problem_visibility === 'during_contest' ? 'Problems hidden until start time' : 'Problems visible as soon as created'}
            </p>
          </div>
        </div>
        {f.event_type === 'team' && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <Label>Min Team Size</Label>
              <Input type="number" min={1} max={f.team_size_max} value={f.team_size_min} onChange={e => setF({...f, team_size_min: Math.max(1, Number(e.target.value) || 1)})} />
            </div>
            <div className="space-y-2">
              <Label>Max Team Size</Label>
              <Input type="number" min={f.team_size_min} value={f.team_size_max} onChange={e => setF({...f, team_size_max: Math.max(f.team_size_min, Number(e.target.value) || 4)})} />
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Codeathon Management</h1>
            <p className="text-muted-foreground text-sm">{codeathons.length} codeathon{codeathons.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" />Create Codeathon
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
          emptyMessage="No codeathons yet. Click 'Create Codeathon' to start."
        />
      )}

      {/* Create Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:w-[512px] sm:max-w-lg flex flex-col h-full overflow-hidden">
          <SheetHeader className="shrink-0">
            <SheetTitle>Create Codeathon</SheetTitle>
            <SheetDescription>Set up a new coding competition.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <FormFields f={form} setF={setForm} prefix="create" />
          </div>
          <SheetFooter className="shrink-0 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}Create
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Edit Sheet */}
      <Sheet open={Boolean(editing)} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <SheetContent side="right" className="w-full sm:w-[672px] sm:max-w-2xl flex flex-col h-full overflow-hidden">
          <SheetHeader className="shrink-0">
            <SheetTitle>Edit Codeathon</SheetTitle>
            <SheetDescription>Update codeathon details and problem set.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-6">
            <FormFields f={editForm} setF={setEditForm} prefix="edit" />

            {/* Problem Set */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Problem Set ({editingProblems.length})</h3>
              </div>
              {editingProblems.length > 0 && (
                <div className="space-y-2">
                  {editingProblems.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/60 bg-muted/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground shrink-0">#{i + 1}</span>
                        <span className="text-sm font-medium truncate">{p.title}</span>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${p.difficulty === 'Hard' ? 'border-red-400 text-red-600' : p.difficulty === 'Easy' ? 'border-green-400 text-green-600' : 'border-yellow-400 text-yellow-600'}`}>
                          {p.difficulty}
                        </Badge>
                        <span className="text-xs text-muted-foreground shrink-0">{p.points} pts</span>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => removeProblem(p.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Problem Title</Label>
                  <Input value={problemForm.title} onChange={e => setProblemForm({...problemForm, title: e.target.value})} placeholder="e.g. Two Sum" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Difficulty</Label>
                  <Select value={problemForm.difficulty} onValueChange={v => setProblemForm({...problemForm, difficulty: v as 'Easy' | 'Medium' | 'Hard'})}>
                    <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Easy">Easy</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Points</Label>
                  <Input type="number" min={1} value={problemForm.points} onChange={e => setProblemForm({...problemForm, points: Number(e.target.value) || 100})} className="h-8 w-20 text-xs" />
                </div>
                <Button size="sm" variant="outline" className="h-8" onClick={addProblem}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          <SheetFooter className="shrink-0 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}Save Changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

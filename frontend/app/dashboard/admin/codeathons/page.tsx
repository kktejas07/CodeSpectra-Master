'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trophy, Plus, Loader2, Trash2, Pencil, Calendar, Users, Target, BookOpen, Settings, Sparkles, X, Shield, Award, Terminal } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

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
  event_type?: string
  team_size_min?: number
  team_size_max?: number
  problem_visibility?: string
}

interface CodeathonFormData {
  title: string
  description: string
  difficulty: string
  topics: string[]
  rules: string
  maxParticipants: number
  startDate: string
  endDate: string
  prizePool: string
  cert_template: string
  event_type: string
  team_size_min: number
  team_size_max: number
  problem_visibility: string
}

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Mixed']
const TOPIC_OPTIONS = [
  'Algorithms', 'Data Structures', 'Web Development', 'Mobile Development',
  'Machine Learning', 'DevOps', 'System Design', 'Database', 'Security', 'Open Innovation'
]

const INITIAL_FORM: CodeathonFormData = {
  title: '',
  description: '',
  difficulty: 'Medium',
  topics: [],
  rules: '',
  maxParticipants: 0,
  startDate: '',
  endDate: '',
  prizePool: '',
  cert_template: 'classic',
  event_type: 'individual',
  team_size_min: 2,
  team_size_max: 4,
  problem_visibility: 'during_contest'
}

/**
 * Top-level form fields component so inputs don't unmount or lose focus on keystrokes.
 */
function CodeathonFormFields({
  formData,
  setFormData,
}: {
  formData: CodeathonFormData
  setFormData: React.Dispatch<React.SetStateAction<CodeathonFormData>>
}) {
  const toggleTopic = (topic: string) => {
    setFormData((prev) => ({
      ...prev,
      topics: prev.topics.includes(topic)
        ? prev.topics.filter((t) => t !== topic)
        : [...prev.topics, topic]
    }))
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      {/* Left Column: Basic Information & Topics */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground">Title *</Label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="e.g. Hackwave 3.0 X StudentAlumni"
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground">Description</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            rows={3}
            placeholder="Describe the codeathon objectives, audience, and scope..."
            className="text-sm resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground">Rules & Guidelines</Label>
          <Textarea
            value={formData.rules}
            onChange={(e) => setFormData((prev) => ({ ...prev, rules: e.target.value }))}
            rows={3}
            placeholder="Code of conduct, allowed tools/languages, submission criteria..."
            className="text-sm resize-none"
          />
        </div>

        <div className="space-y-2 pt-1">
          <Label className="text-xs font-semibold text-foreground">Topics & Focus Areas</Label>
          <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border border-border/60 bg-muted/20">
            {TOPIC_OPTIONS.map((t) => {
              const active = formData.topics.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTopic(t)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                    active
                      ? 'bg-emerald-500 text-black font-semibold border-emerald-400 shadow-xs'
                      : 'bg-card text-muted-foreground border-border hover:border-emerald-500/40 hover:text-foreground'
                  )}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right Column: Parameters, Dates, and Format */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Difficulty</Label>
            <Select
              value={formData.difficulty}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, difficulty: v }))}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Max Participants</Label>
            <Input
              type="number"
              min={0}
              value={formData.maxParticipants || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxParticipants: Number(e.target.value) || 0 }))}
              placeholder="0 = unlimited"
              className="h-9 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Start Date & Time</Label>
            <Input
              type="datetime-local"
              value={formData.startDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">End Date & Time</Label>
            <Input
              type="datetime-local"
              value={formData.endDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
              className="h-9 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Prize Pool</Label>
            <Input
              value={formData.prizePool}
              onChange={(e) => setFormData((prev) => ({ ...prev, prizePool: e.target.value }))}
              placeholder="e.g. ₹50,000 / $1,000"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Certificate Template</Label>
            <Select
              value={formData.cert_template}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, cert_template: v }))}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="classic">Classic (Gold / Serif)</SelectItem>
                <SelectItem value="modern">Modern (Dark Gradient)</SelectItem>
                <SelectItem value="minimal">Minimal (Monochrome)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Event Format Card */}
        <div className="rounded-xl border border-border/80 bg-muted/15 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Terminal className="h-3.5 w-3.5 text-emerald-400" />
            <span>Event Format & Visibility</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Event Type</Label>
              <Select
                value={formData.event_type}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, event_type: v }))}
              >
                <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="team">Team Competition</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Problem Visibility</Label>
              <Select
                value={formData.problem_visibility}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, problem_visibility: v }))}
              >
                <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="during_contest">When contest starts</SelectItem>
                  <SelectItem value="immediate">Immediate on publish</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.event_type === 'team' && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
              <div className="space-y-1">
                <Label className="text-xs">Min Team Size</Label>
                <Input
                  type="number"
                  min={1}
                  max={formData.team_size_max}
                  value={formData.team_size_min}
                  onChange={(e) => setFormData((prev) => ({ ...prev, team_size_min: Math.max(1, Number(e.target.value) || 1) }))}
                  className="h-8 text-xs bg-background"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Team Size</Label>
                <Input
                  type="number"
                  min={formData.team_size_min}
                  value={formData.team_size_max}
                  onChange={(e) => setFormData((prev) => ({ ...prev, team_size_max: Math.max(prev.team_size_min, Number(e.target.value) || 4) }))}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminCodeathonsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [codeathons, setCodeathons] = useState<Codeathon[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Create modal
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CodeathonFormData>(INITIAL_FORM)

  // Edit modal
  const [editing, setEditing] = useState<Codeathon | null>(null)
  const [editForm, setEditForm] = useState<CodeathonFormData>(INITIAL_FORM)

  // Problem management inside edit modal
  const [problemForm, setProblemForm] = useState<{ title: string; difficulty: 'Easy' | 'Medium' | 'Hard'; points: number; description: string }>({
    title: '',
    difficulty: 'Medium',
    points: 100,
    description: ''
  })
  const [editingProblems, setEditingProblems] = useState<Problem[]>([])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/codeathons', { credentials: 'include' })
      const json = await res.json()
      setCodeathons(json.data || [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
  }, [])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/codeathons?id=${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} codeathon${ids.length !== 1 ? 's' : ''} deleted` })
    setCodeathons((prev) => prev.filter((c) => !ids.includes(c.id)))
  }

  const openEdit = (c: Codeathon) => {
    setEditForm({
      title: c.title || '',
      description: c.description || '',
      difficulty: c.difficulty || 'Medium',
      topics: c.topics || [],
      rules: c.rules || '',
      maxParticipants: c.maxParticipants || 0,
      startDate: c.startDate || '',
      endDate: c.endDate || '',
      prizePool: c.prizePool || '',
      cert_template: c.cert_template || 'classic',
      event_type: c.event_type || 'individual',
      team_size_min: c.team_size_min || 2,
      team_size_max: c.team_size_max || 4,
      problem_visibility: c.problem_visibility || 'during_contest',
    })
    setEditingProblems(c.problems || [])
    setEditing(c)
  }

  const handleCreate = async () => {
    if (!form.title.trim()) {
      addToast({ type: 'error', title: 'Title is required' })
      return
    }
    setSaving(true)
    try {
      const res = await csrfFetch('/api/codeathons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, status: 'upcoming' }),
      })
      if (!res.ok) throw new Error('Failed to create codeathon')
      void fetchData()
      addToast({ type: 'success', title: 'Codeathon created successfully' })
      setCreateOpen(false)
      setForm(INITIAL_FORM)
    } catch {
      addToast({ type: 'error', title: 'Failed to create codeathon' })
    } finally {
      setSaving(false)
    }
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
      if (!res.ok) throw new Error('Failed to update codeathon')
      addToast({ type: 'success', title: 'Codeathon updated successfully' })
      setEditing(null)
      void fetchData()
    } catch {
      addToast({ type: 'error', title: 'Failed to update codeathon' })
    } finally {
      setSaving(false)
    }
  }

  const addProblem = () => {
    if (!problemForm.title.trim()) return
    setEditingProblems((prev) => [...prev, { ...problemForm, id: crypto.randomUUID() }])
    setProblemForm({ title: '', difficulty: 'Medium', points: 100, description: '' })
  }

  const removeProblem = (id: string) => {
    setEditingProblems((prev) => prev.filter((p) => p.id !== id))
  }

  const columns: DataTableColumn<Codeathon>[] = [
    { key: 'title', header: 'Title', cell: (r) => <span className="font-semibold text-foreground">{r.title}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge
          className={
            r.status === 'active'
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : r.status === 'upcoming'
              ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
              : 'bg-muted text-muted-foreground border-border'
          }
        >
          {r.status}
        </Badge>
      ),
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      cell: (r) => (
        <Badge
          variant="outline"
          className={
            r.difficulty === 'Hard'
              ? 'border-rose-400 text-rose-400 bg-rose-500/10'
              : r.difficulty === 'Easy'
              ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
              : 'border-amber-400 text-amber-400 bg-amber-500/10'
          }
        >
          {r.difficulty || 'Medium'}
        </Badge>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.startDate ? new Date(r.startDate).toLocaleDateString() : 'N/A'} — {r.endDate ? new Date(r.endDate).toLocaleDateString() : 'N/A'}
        </span>
      ),
    },
    {
      key: 'participants',
      header: 'Participants',
      cell: (r) => `${r.participants || 0}${r.maxParticipants ? `/${r.maxParticipants}` : ''}`,
    },
    { key: 'problems', header: 'Problems', cell: (r) => r.problems?.length || 0 },
    { key: 'prize', header: 'Prize Pool', cell: (r) => r.prizePool || '—' },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </Button>
      ),
    },
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleDelete },
  ]

  if (!gate.ready) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-emerald-500/15 to-teal-500/10 border border-primary/20 shadow-sm">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Codeathon Management</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Create, configure, and manage real-time coding tournaments and problem sets.
            </p>
          </div>
        </div>
        <Button
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-md"
          onClick={() => {
            setForm(INITIAL_FORM)
            setCreateOpen(true)
          }}
        >
          <Plus className="w-4 h-4" />
          Create Codeathon
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
          Loading codeathons...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={codeathons}
          searchPlaceholder="Search codeathons..."
          searchKeys={['title']}
          filters={[
            {
              label: 'Status',
              key: 'status',
              options: [
                { label: 'Upcoming', value: 'upcoming' },
                { label: 'Active', value: 'active' },
                { label: 'Ended', value: 'ended' },
              ],
            },
          ]}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No codeathons yet. Click 'Create Codeathon' to start."
        />
      )}

      {/* CREATE DIALOG MODAL (Wide Horizontal View) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-border bg-card/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">Create Codeathon</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Configure competition parameters, topics, timeline, and participant guidelines in a unified horizontal view.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <CodeathonFormFields formData={form} setFormData={setForm} />
          </div>

          <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !form.title.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Create Codeathon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG MODAL (Wide Horizontal View with Problem Set Manager) */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-border bg-card/95 backdrop-blur-xl shadow-2xl">
          <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 border border-primary/30 text-primary">
                <Pencil className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">Edit Codeathon: {editing?.title}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Update competition details, event parameters, and curate the problem set.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6">
            <CodeathonFormFields formData={editForm} setFormData={setEditForm} />

            {/* Problem Set Manager Card */}
            <div className="px-6 pb-6">
              <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-foreground">Problem Set ({editingProblems.length})</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Total Points: {editingProblems.reduce((sum, p) => sum + (p.points || 0), 0)} pts
                  </span>
                </div>

                {editingProblems.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {editingProblems.map((p, i) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border bg-card/60"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono text-muted-foreground shrink-0">#{i + 1}</span>
                          <span className="text-xs font-semibold text-foreground truncate">{p.title}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] shrink-0 ${
                              p.difficulty === 'Hard'
                                ? 'border-rose-400 text-rose-400'
                                : p.difficulty === 'Easy'
                                ? 'border-emerald-400 text-emerald-400'
                                : 'border-amber-400 text-amber-400'
                            }`}
                          >
                            {p.difficulty}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-mono text-muted-foreground">{p.points} pts</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-400"
                            onClick={() => removeProblem(p.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                    No problems linked to this competition yet. Add problems below.
                  </div>
                )}

                {/* Inline Add Problem */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_100px_auto] gap-2 items-end pt-2 border-t border-border/60">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">Problem Title</Label>
                    <Input
                      value={problemForm.title}
                      onChange={(e) => setProblemForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. Dynamic Path Sum"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">Difficulty</Label>
                    <Select
                      value={problemForm.difficulty}
                      onValueChange={(v) => setProblemForm((prev) => ({ ...prev, difficulty: v as 'Easy' | 'Medium' | 'Hard' }))}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">Points</Label>
                    <Input
                      type="number"
                      min={1}
                      value={problemForm.points}
                      onChange={(e) => setProblemForm((prev) => ({ ...prev, points: Number(e.target.value) || 100 }))}
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs gap-1 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-500/30"
                    onClick={addProblem}
                    disabled={!problemForm.title.trim()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Problem
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={saving || !editForm.title.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

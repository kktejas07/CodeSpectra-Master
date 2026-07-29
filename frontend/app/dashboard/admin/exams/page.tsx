'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Plus, Loader2, Trash2, Edit } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface Exam {
  id: string
  title: string
  subject: string
  level: string
  duration: number
  questions: number
  published: boolean
  attempts: number
  avgScore: number
}

export default function AdminExamsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  
  // Form state
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [level, setLevel] = useState('Beginner')
  const [duration, setDuration] = useState(60)
  const [questions, setQuestions] = useState(0)
  const [published, setPublished] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchExams = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/exams', { credentials: 'include' })
      const json = await res.json()
      setExams(json.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchExams() }, [])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/exams?id=${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} exam${ids.length !== 1 ? 's' : ''} deleted` })
    setExams(prev => prev.filter(e => !ids.includes(e.id)))
  }

  const openAddModal = () => {
    setEditingExam(null)
    setTitle('')
    setSubject('')
    setLevel('Beginner')
    setDuration(60)
    setQuestions(0)
    setPublished(false)
    setIsModalOpen(true)
  }

  const openEditModal = (exam: Exam) => {
    setEditingExam(exam)
    setTitle(exam.title)
    setSubject(exam.subject)
    setLevel(exam.level)
    setDuration(exam.duration)
    setQuestions(exam.questions)
    setPublished(exam.published)
    setIsModalOpen(true)
  }

  const handleSaveExam = async () => {
    if (!title) {
      addToast({ type: 'error', title: 'Title is required' })
      return
    }
    
    setSaving(true)
    const payload = { title, subject, level, duration, questions, published }
    
    try {
      if (editingExam) {
        await csrfFetch('/api/exams', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: editingExam.id, ...payload })
        })
        addToast({ type: 'success', title: 'Exam updated successfully' })
      } else {
        await csrfFetch('/api/exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        })
        addToast({ type: 'success', title: 'Exam created successfully' })
      }
      setIsModalOpen(false)
      fetchExams()
    } catch {
      addToast({ type: 'error', title: 'Failed to save exam' })
    } finally {
      setSaving(false)
    }
  }

  const columns: DataTableColumn<Exam>[] = [
    { key: 'title', header: 'Title', cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'subject', header: 'Subject', cell: (r) => r.subject },
    { key: 'level', header: 'Level', cell: (r) => r.level },
    { key: 'duration', header: 'Duration', cell: (r) => `${r.duration} min` },
    { key: 'questions', header: 'Questions', cell: (r) => r.questions },
    { key: 'status', header: 'Status', cell: (r) => (
      <Badge className={r.published ? 'bg-green-500/20 text-green-700' : 'bg-gray-500/20 text-gray-700'}>
        {r.published ? 'Published' : 'Draft'}
      </Badge>
    )},
    { key: 'stats', header: 'Stats', cell: (r) => (
      <span className="text-xs text-muted-foreground">{r.attempts} attempts · {r.avgScore}% avg</span>
    )},
    { key: 'actions', header: '', cell: (r) => (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => openEditModal(r)}>
          <Edit className="w-3.5 h-3.5 mr-1" /> Edit
        </Button>
      </div>
    )}
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
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Exam Management</h1>
            <p className="text-muted-foreground text-sm">{exams.length} exams</p>
          </div>
        </div>
        <Button className="gap-2" onClick={openAddModal}>
          <Plus className="w-4 h-4" />Add Exam
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading exams...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={exams}
          searchPlaceholder="Search exams..."
          searchKeys={['title', 'subject', 'level']}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No exams. Click 'Add Exam' to create one."
        />
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingExam ? 'Edit Exam' : 'Create Exam'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. JavaScript Fundamentals" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. JavaScript" />
            </div>
            <div className="grid gap-2">
              <Label>Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Beginner">Beginner</SelectItem>
                  <SelectItem value="Intermediate">Intermediate</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="duration">Duration (mins)</Label>
                <Input id="duration" type="number" min="0" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 0)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="questions">Questions</Label>
                <Input id="questions" type="number" min="0" value={questions} onChange={(e) => setQuestions(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="space-y-0.5">
                <Label>Published</Label>
                <div className="text-sm text-muted-foreground">
                  Make this exam visible to candidates
                </div>
              </div>
              <Switch checked={published} onCheckedChange={setPublished} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveExam} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingExam ? 'Save Changes' : 'Create Exam'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

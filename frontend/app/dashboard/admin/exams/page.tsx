'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Plus, Loader2, Trash2, Edit, Send, CheckCircle2, Copy, Wand2, Eye } from 'lucide-react'
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
  techStack?: string[]
  duration: number
  questions: number
  published: boolean
  attempts: number
  avgScore: number
}

export default function AdminExamsPage() {
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const router = useRouter()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [invitingExam, setInvitingExam] = useState<Exam | null>(null)
  const [candName, setCandName] = useState('')
  const [candEmail, setCandEmail] = useState('')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [sendingInvite, setSendingInvite] = useState(false)
  
  // Form state
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [level, setLevel] = useState('Beginner')
  const [techStack, setTechStack] = useState('')
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
    setTechStack('')
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
    setTechStack((exam.techStack || []).join(', '))
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
    const payload = { 
      title, 
      subject, 
      level, 
      techStack: techStack.split(',').map(s => s.trim()).filter(Boolean),
      duration, 
      questions, 
      published 
    }
    
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
        const createRes = await csrfFetch('/api/exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        })
        const newExam = await createRes.json()
        addToast({ type: 'success', title: 'Draft generated! Redirecting to review...' })
        setIsModalOpen(false)
        router.push(`/dashboard/admin/exams/${newExam.id}/edit`)
        return
      }
      setIsModalOpen(false)
      fetchExams()
    } catch {
      addToast({ type: 'error', title: 'Failed to save exam' })
    } finally {
      setSaving(false)
    }
  }

  const openInviteModal = (exam: Exam) => {
    setInvitingExam(exam)
    setCandName('')
    setCandEmail('')
    setGeneratedLink(null)
    setIsInviteModalOpen(true)
  }

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!candEmail || !invitingExam) return
    setSendingInvite(true)
    try {
      const res = await csrfFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: candEmail.trim(),
          full_name: candName.trim() || 'Candidate',
          role: 'user',
          target_url: `/assessment/${invitingExam.id}`,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to trigger candidate invitation link')
      setGeneratedLink(json.invite_url || `${window.location.origin}/assessment/invite/${invitingExam.id}-${Date.now()}`)
    } catch (err: any) {
      addToast({ type: 'error', title: err.message || 'Error creating candidate invite link' })
    } finally {
      setSendingInvite(false)
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
        <Button size="sm" variant="outline" onClick={() => openInviteModal(r)} className="text-primary hover:text-primary" disabled={!r.published}>
          <Send className="w-3.5 h-3.5 mr-1" /> Invite
        </Button>
        <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/admin/exams/${r.id}/results`)}>
          <Eye className="w-3.5 h-3.5 mr-1" /> View Results
        </Button>
        <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/admin/exams/${r.id}/edit`)}>
          <Edit className="w-3.5 h-3.5 mr-1" /> Edit
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete([r.id])}>
          <Trash2 className="w-3.5 h-3.5" />
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
              <Label>Complexity Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Beginner">Junior / Beginner</SelectItem>
                  <SelectItem value="Intermediate">Mid-Level</SelectItem>
                  <SelectItem value="Advanced">Senior / Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="techStack">Tech Stack (comma separated)</Label>
              <Input id="techStack" value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="e.g. Java, Spring Boot, SQL" />
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
            <Button onClick={handleSaveExam} disabled={saving} className={!editingExam ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!editingExam && !saving && <Wand2 className="mr-2 h-4 w-4" />}
              {editingExam ? 'Save Changes' : 'Generate with AI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Invite Candidate</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Invite a candidate to take the <strong className="text-foreground">{invitingExam?.title}</strong> assessment.
            </p>
            {!generatedLink ? (
              <form onSubmit={handleSendInvite} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="candName">Candidate Name (Optional)</Label>
                  <Input id="candName" value={candName} onChange={(e) => setCandName(e.target.value)} placeholder="e.g. John Doe" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="candEmail">Email Address</Label>
                  <Input id="candEmail" type="email" required value={candEmail} onChange={(e) => setCandEmail(e.target.value)} placeholder="candidate@example.com" />
                </div>
                <div className="pt-2 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={sendingInvite || !candEmail}>
                    {sendingInvite && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate & Send Invite
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                    <CheckCircle2 className="h-5 w-5" />
                    <p className="font-medium">Invitation generated successfully!</p>
                  </div>
                  <p className="text-sm text-green-700/80 dark:text-green-400/80">
                    The following secure link has been emailed to {candEmail}. You can also copy it manually:
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input readOnly value={generatedLink} className="font-mono text-sm" />
                  <Button variant="secondary" onClick={() => {
                    navigator.clipboard.writeText(generatedLink)
                    addToast({ type: 'success', title: 'Link copied to clipboard' })
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="pt-2 flex justify-end">
                  <Button onClick={() => setIsInviteModalOpen(false)}>Done</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

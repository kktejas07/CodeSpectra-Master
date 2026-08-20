'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {   BookOpen, Plus, Loader2, Trash2, Edit, Send, CheckCircle2, Copy, Wand2, Eye, MoreHorizontal, Upload, Download, Users, Link2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { BRANCHES, DEGREE_TYPES, SCREENING_TYPES } from '@/lib/engineering-catalog'

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
  degree_type?: string
  branch?: string
  screening_type?: string
  tenant_id?: string | null
  createdAt?: string
}

interface Tenant {
  id: string
  name: string
}

export default function AdminExamsPage() {
  const gate = usePageGuard('tenant_admin')
  const addToast = useToast()
  const router = useRouter()
  const [exams, setExams] = useState<Exam[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [invitingExam, setInvitingExam] = useState<Exam | null>(null)
  const [candName, setCandName] = useState('')
  const [candEmail, setCandEmail] = useState('')
  const [candCc, setCandCc] = useState('')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [sendingInvite, setSendingInvite] = useState(false)

  const [isBulkInviteOpen, setIsBulkInviteOpen] = useState(false)
  const [bulkInviteExam, setBulkInviteExam] = useState<Exam | null>(null)
  const [bulkCsvText, setBulkCsvText] = useState('')
  const [bulkPreview, setBulkPreview] = useState<{ name: string; email: string }[] | null>(null)
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResults, setBulkResults] = useState<{ sent: number; failed: number; errors: string[] } | null>(null)
  
  // Form state
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [level, setLevel] = useState('Beginner')
  const [techStack, setTechStack] = useState('')
  const [duration, setDuration] = useState(60)
  const [questions, setQuestions] = useState(0)
  const [published, setPublished] = useState(false)
  const [accessType, setAccessType] = useState<'invite_only' | 'open'>('invite_only')
  const [degreeType, setDegreeType] = useState('')
  const [branch, setBranch] = useState('')
  const [screeningType, setScreeningType] = useState('mixed')
  const [saving, setSaving] = useState(false)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [datePreset, setDatePreset] = useState<'all' | '7d' | '30d' | '90d' | 'year'>('all')

  const applyDatePreset = (preset: 'all' | '7d' | '30d' | '90d' | 'year'): { from: string; to: string } => {
    if (preset === 'all') return { from: '', to: '' }
    const to = new Date().toISOString().split('T')[0]
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 0
    const from = days === 0 ? `${new Date().getFullYear()}-01-01` : new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
    return { from, to }
  }

  const handleDatePreset = (preset: 'all' | '7d' | '30d' | '90d' | 'year') => {
    const { from, to } = applyDatePreset(preset)
    setDatePreset(preset)
    setDateFrom(from)
    setDateTo(to)
  }

  const clearDateFilter = () => {
    setDateFrom('')
    setDateTo('')
    setDatePreset('all')
  }

  const filterByDate = (item: Exam): boolean => {
    if (!dateFrom && !dateTo) return true
    const created = item.createdAt ? new Date(item.createdAt).getTime() : NaN
    if (dateFrom && !(created >= new Date(dateFrom).getTime())) return false
    if (dateTo && !(created <= new Date(dateTo + 'T23:59:59').getTime())) return false
    return true
  }

  const visibleExams = exams.filter(filterByDate)

  const fetchExams = async () => {
    setLoading(true)
    try {
      const [examsRes, tenantsRes] = await Promise.all([
        fetch('/api/exams', { credentials: 'include' }),
        fetch('/api/admin/tenants', { credentials: 'include' }),
      ])
      const examsJson = await examsRes.json()
      const tenantsJson = await tenantsRes.json()
      setExams(examsJson.data || [])
      setTenants(tenantsJson.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchExams() }, [])

  const handleDelete = async (ids: string[]) => {
    for (const id of ids) {
      await csrfFetch(`/api/exams?id=${id}`, { method: 'DELETE', credentials: 'include' })
    }
        addToast({ type: 'success', title: `${ids.length} assessment${ids.length !== 1 ? 's' : ''} deleted` })
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
    setAccessType('invite_only')
    setDegreeType('')
    setBranch('')
    setScreeningType('mixed')
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
    setDegreeType(exam.degree_type || '')
    setBranch(exam.branch || '')
    setScreeningType(exam.screening_type || 'mixed')
    setIsModalOpen(true)
  }

  const handleSaveExam = async () => {
    if (!title) {
      addToast({ type: 'error', title: 'Title is required' })
      return
    }
    
    setSaving(true)
    const       payload = { 
      title, 
      subject, 
      level, 
      techStack: techStack.split(',').map(s => s.trim()).filter(Boolean),
      duration, 
      questions, 
      published,
      access_type: accessType,
      degree_type: degreeType,
      branch,
      screening_type: screeningType,
    }
    
    try {
      if (editingExam) {
        await csrfFetch('/api/exams', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: editingExam.id, ...payload })
        })
        addToast({ type: 'success', title: 'Assessment updated successfully' })
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
        router.push(`/dashboard/admin/assessments/${newExam.id}/edit`)
        return
      }
      setIsModalOpen(false)
      fetchExams()
    } catch {
      addToast({ type: 'error', title: 'Failed to save assessment' })
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
          exam_title: invitingExam.title,
          cc_email: candCc.trim() || undefined,
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

  const parseBulkCsv = (text: string): { name: string; email: string }[] => {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return []
    const firstLine = lines[0].toLowerCase()
    const hasHeader = firstLine.includes('email') || firstLine.includes('name')
    const startIdx = hasHeader ? 1 : 0
    const candidates: { name: string; email: string }[] = []
    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(',').map(s => s.trim().replace(/^"(.*)"$/, '$1'))
      if (parts.length < 2) {
        candidates.push({ name: 'Candidate', email: parts[0] })
      } else {
        const maybeEmail = parts[0].includes('@') ? parts[0] : parts[1]
        const maybeName = parts[0].includes('@') ? parts[1] : parts[0]
        candidates.push({ name: maybeName || 'Candidate', email: maybeEmail })
      }
    }
    return candidates.filter(c => c.email.includes('@'))
  }

  const handleBulkInvite = async () => {
    if (!bulkPreview || !bulkInviteExam) return
    setBulkSending(true)
    let sent = 0; let failed = 0; const errors: string[] = []
    for (const c of bulkPreview) {
      try {
        const res = await csrfFetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: c.email,
            full_name: c.name || 'Candidate',
            role: 'user',
            target_url: `/assessment/${bulkInviteExam.id}`,
            exam_title: bulkInviteExam.title,
          }),
        })
        if (res.ok) { sent++ } else { failed++; errors.push(`${c.email}: ${(await res.json()).error || 'Failed'}`) }
      } catch { failed++; errors.push(`${c.email}: Network error`) }
    }
    setBulkResults({ sent, failed, errors })
    setBulkSending(false)
    addToast({ type: sent > 0 ? 'success' : 'error', title: `${sent} sent, ${failed} failed` })
  }

  const columns: DataTableColumn<Exam>[] = [
    { key: 'title', header: 'Title', cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'subject', header: 'Subject', cell: (r) => r.subject },
    { key: 'tenant', header: 'Organization', cell: (r) => {
      if (!r.tenant_id) return <span className="text-muted-foreground">Platform</span>
      const tenant = tenants.find(t => t.id === r.tenant_id)
      return tenant?.name || <span className="text-muted-foreground">Unknown</span>
    }},
    { key: 'branch', header: 'Branch', cell: (r) => r.branch ? BRANCHES.find(b => b.id === r.branch)?.short || r.branch : 'General' },
    { key: 'screening', header: 'Screening', cell: (r) => SCREENING_TYPES.find(s => s.id === r.screening_type)?.short || '—' },
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
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="More options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => openInviteModal(r)} disabled={!r.published} className="gap-2">
              <Send className="h-4 w-4" /> Invite Candidate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setBulkInviteExam(r); setBulkCsvText(''); setBulkPreview(null); setBulkResults(null); setIsBulkInviteOpen(true) }} disabled={!r.published} className="gap-2">
              <Users className="h-4 w-4" /> Bulk Invite
            </DropdownMenuItem>
            {r.published && (
              <DropdownMenuItem onClick={() => {
                const url = `${window.location.origin}/assessment/${r.id}?share=true`
                navigator.clipboard.writeText(url)
                addToast({ type: 'success', title: 'Public link copied!' })
              }} className="gap-2">
                <Link2 className="h-4 w-4" /> Copy Public Link
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/assessments/${r.id}/results`)} className="gap-2">
              <Eye className="h-4 w-4" /> View Results
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/assessments/${r.id}/edit`)} className="gap-2">
              <Edit className="h-4 w-4" /> Edit Assessment
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete([r.id])} className="gap-2 text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
            <h1 className="text-3xl font-bold text-foreground">Assessment Management</h1>
            <p className="text-muted-foreground text-sm">{visibleExams.length} assessments</p>
          </div>
        </div>
        <Button className="gap-2" onClick={openAddModal}>
          <Plus className="w-4 h-4" />Add Assessment
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <span className="text-sm font-medium text-muted-foreground">Created:</span>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setDatePreset('all') }} className="h-9 w-auto text-sm" />
        <span className="text-muted-foreground">to</span>
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setDatePreset('all') }} className="h-9 w-auto text-sm" />
        <div className="flex items-center gap-1">
          {([['7d', '7D'], ['30d', '30D'], ['90d', '90D'], ['year', 'Year']] as const).map(([val, label]) => (
            <Button key={val} size="sm" variant={datePreset === val ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => handleDatePreset(val)}>
              {label}
            </Button>
          ))}
        </div>
        {(dateFrom || dateTo) && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={clearDateFilter}>
            Clear
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading assessments...
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={visibleExams}
          searchPlaceholder="Search assessments..."
          searchKeys={['title', 'subject', 'level', 'tenant_id']}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No assessments. Click 'Add Assessment' to create one."
        />
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editingExam ? 'Edit Assessment' : 'Create Assessment'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="col-span-1 sm:col-span-2 grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. JavaScript Fundamentals" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subject">Target Role / Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. QA Engineer, Full Stack Developer" />
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
              <Label>Degree (optional)</Label>
              <Select value={degreeType || 'any'} onValueChange={v => setDegreeType(v === 'any' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Any degree" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any degree</SelectItem>
                  {DEGREE_TYPES.map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Branch (optional)</Label>
              <Select value={branch || 'any'} onValueChange={v => setBranch(v === 'any' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="General / all branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">General / all branches</SelectItem>
                  {BRANCHES.map(b => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Screening Type</Label>
              <Select value={screeningType} onValueChange={setScreeningType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCREENING_TYPES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="duration">Duration (mins)</Label>
              <Input id="duration" type="number" min="0" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 0)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="questions">Questions</Label>
              <Input id="questions" type="number" min="0" value={questions} onChange={(e) => setQuestions(parseInt(e.target.value) || 0)} />
            </div>
            <div className="sm:col-span-2 grid gap-2">
              <Label htmlFor="techStack">Topics / Skills (comma separated)</Label>
              <Input id="techStack" value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="e.g. Selenium, TestNG, API Testing, SQL" />
            </div>
            <div className="flex items-center justify-between mt-2 sm:col-span-2">
              <div className="space-y-0.5">
                <Label>Access Type</Label>
                <div className="text-sm text-muted-foreground">
                  Who can take this assessment
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAccessType('invite_only')}
                  className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                    accessType === 'invite_only'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  Invite Only
                </button>
                <button
                  type="button"
                  onClick={() => setAccessType('open')}
                  className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                    accessType === 'open'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  Open to All
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 sm:col-span-2">
              <div className="space-y-0.5">
                <Label>Published</Label>
                <div className="text-sm text-muted-foreground">
                  Make this assessment visible to candidates
                </div>
              </div>
              <Switch checked={published} onCheckedChange={setPublished} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveExam} disabled={saving} className={!editingExam ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!editingExam && !saving && questions > 0 && <Wand2 className="mr-2 h-4 w-4" />}
              {!editingExam && !saving && questions === 0 && <Plus className="mr-2 h-4 w-4" />}
              {editingExam ? 'Save Changes' : questions > 0 ? 'Generate with AI' : 'Create Blank Assessment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Invite Candidate</SheetTitle>
            <SheetDescription>
              Send an assessment invitation to a candidate for <strong>{invitingExam?.title}</strong>.
            </SheetDescription>
          </SheetHeader>
          {!generatedLink ? (
            <form onSubmit={handleSendInvite} className="space-y-4 px-4 pb-4">
              <div className="space-y-2">
                <Label htmlFor="candName">Candidate Name <span className="text-muted-foreground">(Optional)</span></Label>
                <Input id="candName" value={candName} onChange={(e) => setCandName(e.target.value)} placeholder="e.g. John Doe" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="candEmail">Email Address *</Label>
                <Input id="candEmail" type="email" required value={candEmail} onChange={(e) => setCandEmail(e.target.value)} placeholder="candidate@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="candCc">CC Email <span className="text-muted-foreground">(Optional)</span></Label>
                <Input id="candCc" type="email" value={candCc} onChange={(e) => setCandCc(e.target.value)} placeholder="manager@company.com" />
                <p className="text-xs text-muted-foreground">Copy this person on the invitation email</p>
              </div>
              <SheetFooter>
                <Button type="button" variant="outline" onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={sendingInvite || !candEmail}>
                  {sendingInvite && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Invite
                </Button>
              </SheetFooter>
            </form>
          ) : (
            <div className="space-y-4 px-4 pb-4">
              <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <p className="font-medium">Invitation sent!</p>
                </div>
                <p className="text-sm text-green-700/80 dark:text-green-400/80">
                  Link emailed to <strong>{candEmail}</strong>
                </p>
              </div>
              <div className="space-y-2">
                <Label>Invite Link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={generatedLink} className="font-mono text-sm" />
                  <Button variant="secondary" onClick={() => {
                    navigator.clipboard.writeText(generatedLink)
                    addToast({ type: 'success', title: 'Copied!' })
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <SheetFooter>
                <Button onClick={() => setIsInviteModalOpen(false)}>Done</Button>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={isBulkInviteOpen} onOpenChange={setIsBulkInviteOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Invite Candidates — {bulkInviteExam?.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {bulkResults ? (
              <div className="space-y-4">
                <div className={`rounded-lg border p-4 ${bulkResults.failed === 0 ? 'border-green-500/20 bg-green-500/10' : 'border-amber-500/20 bg-amber-500/10'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <p className="font-medium">{bulkResults.sent} invite(s) sent, {bulkResults.failed} failed</p>
                  </div>
                  {bulkResults.errors.length > 0 && (
                    <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                      {bulkResults.errors.map((e, i) => <p key={i} className="text-red-500">{e}</p>)}
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setIsBulkInviteOpen(false)}>Done</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Paste CSV (email, name)</Label>
                  <p className="text-xs text-muted-foreground">
                    <strong>CSV:</strong> One candidate per line — <code>email,name</code> or <code>jane@example.com,Jane</code>
                    <br />Names are optional. Header row is detected automatically.
                  </p>
                  <div className="max-h-[250px] overflow-y-auto border rounded-md">
                    <Textarea
                      value={bulkCsvText}
                      onChange={(e) => { setBulkCsvText(e.target.value); setBulkPreview(null) }}
                      rows={8}
                      placeholder={'email,name\njohn@example.com,John\njane@example.com,Jane'}
                      className="font-mono text-sm min-h-[150px] border-0 focus-visible:ring-0 rounded-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => {
                    const sample = 'email,name\njohn.doe@example.com,John Doe\njane.smith@example.com,Jane Smith\nalex@example.com,Alex'
                    setBulkCsvText(sample)
                    setBulkPreview(null)
                  }} className="gap-2">
                    <Download className="h-3.5 w-3.5" /> Sample CSV
                  </Button>
                  <input
                    id="bulk-file-input"
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setBulkCsvText(await file.text())
                      setBulkPreview(null)
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('bulk-file-input')?.click()} className="gap-2">
                    <Upload className="h-3.5 w-3.5" /> Upload File
                  </Button>
                  <Button onClick={() => {
                    const candidates = parseBulkCsv(bulkCsvText)
                    if (candidates.length === 0) {
                      addToast({ type: 'error', title: 'No valid emails found in the CSV' })
                      return
                    }
                    setBulkPreview(candidates)
                  }} disabled={!bulkCsvText.trim()} className="gap-2">
                    Preview
                  </Button>
                </div>
                {bulkPreview && (
                  <div className="border rounded-md p-3 bg-muted/20 space-y-2">
                    <p className="text-sm font-medium">{bulkPreview.length} candidate(s) found</p>
                    <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
                      {bulkPreview.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                          <span className="font-mono text-primary shrink-0 w-6">{i + 1}.</span>
                          <span className="font-medium text-foreground truncate">{c.name}</span>
                          <span className="text-muted-foreground truncate ml-auto">{c.email}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {!bulkResults && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsBulkInviteOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkInvite} disabled={bulkSending || !bulkPreview || bulkPreview.length === 0}>
                {bulkSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send {bulkPreview?.length || 0} Invites
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Plus, Loader2, Trash2, Edit, Send, CheckCircle2, Copy, Wand2, Eye, MoreHorizontal, Upload, Download, Users, Link2, LayoutDashboard, ChevronDown, ChevronUp, Monitor, Smartphone, Tablet, Globe } from 'lucide-react'
import { SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePageGuard } from '@/lib/use-page-guard'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import { PageHeader, StatCard } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { BRANCHES, DEGREE_TYPES, SCREENING_TYPES } from '@/lib/engineering-catalog'
import { usePlatformTimezone } from '@/lib/use-platform-timezone'
import { toZonedDatetimeString, fromZonedDatetimeString } from '@/lib/datetime-local'
import { toZonedDateInput, formatDateTime } from '@/lib/format-datetime'

interface Exam {
  id: string
  title: string
  subject: string
  level: string
  techStack?: string[]
  duration: number
  starts_at?: string | null
  ends_at?: string | null
  require_id_verification?: boolean | null
  require_face_capture?: boolean | null
  questions: number
  published: boolean
  attempts: number
  avgScore: number
  degree_type?: string
  branch?: string
  screening_type?: string
  tenant_id?: string | null
  createdAt?: string
  invites?: number
  released?: number
}

interface Tenant {
  id: string
  name: string
}

export default function AdminExamsPage() {
  const gate = usePageGuard('tenant_admin')
  // Platform timezone (Settings → General) for every date display / entry.
  const tz = usePlatformTimezone()
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
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [requireTokenLinks, setRequireTokenLinks] = useState(false)
  const [requireIdVerification, setRequireIdVerification] = useState(true)
  const [requireFaceCapture, setRequireFaceCapture] = useState(true)
  const [questions, setQuestions] = useState(0)
  const [published, setPublished] = useState(false)
  const [accessType, setAccessType] = useState<'invite_only' | 'open'>('invite_only')
  const [degreeType, setDegreeType] = useState('')
  const [branch, setBranch] = useState('')
  const [screeningType, setScreeningType] = useState('mixed')
  const [saving, setSaving] = useState(false)

  // Share-link dialog state (replaces immediate ?share=true copy)
  const [isLinkOpen, setIsLinkOpen] = useState(false)
  const [linkExam, setLinkExam] = useState<Exam | null>(null)
  const [linkType, setLinkType] = useState<'public' | 'invited'>('public')
  const [linkEmail, setLinkEmail] = useState('')
  const [linkPreset, setLinkPreset] = useState<'1h' | '24h' | '7d' | '30d' | 'never' | 'custom'>('7d')
  const [linkCustom, setLinkCustom] = useState('')
  const [linkMaxUses, setLinkMaxUses] = useState('')
  const [linkCreating, setLinkCreating] = useState(false)
  const [linkCreatedUrl, setLinkCreatedUrl] = useState<string | null>(null)
  const [linkRows, setLinkRows] = useState<{ id: string; type: string; token: string; url: string; expires_at: string | null; max_uses: number | null; used_count: number; revoked: boolean; created_at: string }[]>([])
  const [linkLoading, setLinkLoading] = useState(false)

  // Link usage log state
  const [usageLinkId, setUsageLinkId] = useState<string | null>(null)
  const [usageRows, setUsageRows] = useState<Array<{
    id: string; ip_address: string | null; user_agent: string | null;
    device_type: string; browser: string; os: string;
    user_email: string | null; user_name: string | null; accessed_at: string
  }>>([])
  const [usageLoading, setUsageLoading] = useState(false)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [datePreset, setDatePreset] = useState<'all' | '7d' | '30d' | '90d' | 'year'>('all')

  const applyDatePreset = (preset: 'all' | '7d' | '30d' | '90d' | 'year'): { from: string; to: string } => {
    if (preset === 'all') return { from: '', to: '' }
    const to = toZonedDateInput(new Date(), tz)
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 0
    const from = days === 0 ? `${toZonedDateInput(new Date(), tz).slice(0, 4)}-01-01` : toZonedDateInput(Date.now() - days * 86400000, tz)
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
    setStartsAt('')
    setEndsAt('')
    setRequireTokenLinks(false)
    setRequireIdVerification(true)
    setRequireFaceCapture(true)
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
    setStartsAt(exam.starts_at ? toZonedDatetimeString(new Date(exam.starts_at), tz) : '')
    setEndsAt(exam.ends_at ? toZonedDatetimeString(new Date(exam.ends_at), tz) : '')
    setRequireIdVerification(exam.require_id_verification !== false)
    setRequireFaceCapture(exam.require_face_capture !== false)
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
    const startsIso = startsAt ? fromZonedDatetimeString(startsAt, tz) : null
    const endsIso = endsAt ? fromZonedDatetimeString(endsAt, tz) : null
    if (startsIso && endsIso && new Date(endsIso).getTime() <= new Date(startsIso).getTime()) {
      addToast({ type: 'error', title: 'Deadline must be after the available-from time' })
      return
    }
    
    setSaving(true)
    const       payload = { 
      title, 
      subject, 
      level, 
      techStack: techStack.split(',').map(s => s.trim()).filter(Boolean),
      duration,
      starts_at: startsIso,
      ends_at: endsIso,
      require_token_links: requireTokenLinks,
      require_id_verification: requireIdVerification,
      require_face_capture: requireFaceCapture,
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
        // POST builds the doc from known fields only — persist the window
        // via PATCH (pass-through) so create+edit stay in parity.
        if (startsIso || endsIso) {
          await csrfFetch('/api/exams', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: newExam.id, starts_at: startsIso, ends_at: endsIso })
          })
        }
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

  const openLinkDialog = (exam: Exam) => {
    setLinkExam(exam)
    setLinkType('public')
    setLinkEmail('')
    setLinkPreset('7d')
    setLinkCustom('')
    setLinkMaxUses('')
    setLinkCreatedUrl(null)
    setIsLinkOpen(true)
    void fetchLinks(exam.id)
  }

  const fetchLinks = async (examId: string) => {
    setLinkLoading(true)
    try {
      const res = await fetch(`/api/exams/${examId}/links`, { credentials: 'include' })
      const json = await res.json()
      setLinkRows(json.data || [])
    } catch { /* ignore */ }
    finally { setLinkLoading(false) }
  }

  const fetchUsage = async (examId: string, linkId: string) => {
    if (usageLinkId === linkId) {
      setUsageLinkId(null)
      setUsageRows([])
      return
    }
    setUsageLinkId(linkId)
    setUsageLoading(true)
    try {
      const res = await fetch(`/api/exams/${examId}/links?linkId=${encodeURIComponent(linkId)}`, { credentials: 'include' })
      const json = await res.json()
      setUsageRows(json.data || [])
    } catch { /* ignore */ }
    finally { setUsageLoading(false) }
  }

  const linkExpiryIso = (): string | null => {
    if (linkPreset === 'never') return null
    if (linkPreset === 'custom') return linkCustom ? fromZonedDatetimeString(linkCustom, tz) : null
    const hours = linkPreset === '1h' ? 1 : linkPreset === '24h' ? 24 : linkPreset === '7d' ? 168 : 720
    return new Date(Date.now() + hours * 3600000).toISOString()
  }

  const linkExpirySummary = (iso: string | null): string => {
    if (!iso) return 'never expires'
    return `expires ${formatDateTime(iso)}`
  }

  const handleCreateLink = async () => {
    if (!linkExam) return
    if (linkType === 'invited' && !linkEmail.includes('@')) {
      addToast({ type: 'error', title: 'Email is required for invited links' })
      return
    }
    setLinkCreating(true)
    try {
      const expiresAt = linkExpiryIso()
      const res = await csrfFetch(`/api/exams/${linkExam.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: linkType,
          email: linkType === 'invited' ? linkEmail.trim() : undefined,
          expires_at: expiresAt,
          max_uses: linkMaxUses ? parseInt(linkMaxUses) || null : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create link')
      setLinkCreatedUrl(json.url)
      navigator.clipboard.writeText(json.url).catch(() => {})
      addToast({ type: 'success', title: `Link copied — ${linkExpirySummary(json.expires_at)}${json.max_uses ? `, max ${json.max_uses} uses` : ''}` })
      void fetchLinks(linkExam.id)
    } catch (err: unknown) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to create link' })
    } finally {
      setLinkCreating(false)
    }
  }

  const handleRevokeLink = async (linkId: string) => {
    if (!linkExam) return
    try {
      const res = await csrfFetch(`/api/exams/${linkExam.id}/links?linkId=${linkId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to revoke link')
      addToast({ type: 'success', title: 'Link revoked' })
      void fetchLinks(linkExam.id)
    } catch {
      addToast({ type: 'error', title: 'Failed to revoke link' })
    }
  }

  const columns: DataTableColumn<Exam>[] = [    { key: 'title', header: 'Title', sortable: true, cell: (r) => (
      <button
        type="button"
        title="Open results"
        onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/admin/assessments/${r.id}/results`) }}
        className="font-medium text-left hover:text-primary hover:underline underline-offset-4 transition-colors"
      >
        {r.title}
      </button>
    ) },
    { key: 'subject', header: 'Subject', sortable: true, cell: (r) => r.subject },
    { key: 'tenant', header: 'Organization', sortable: true, cell: (r) => {
      if (!r.tenant_id) return <span className="text-muted-foreground">Platform</span>
      const tenant = tenants.find(t => t.id === r.tenant_id)
      return tenant?.name || <span className="text-muted-foreground">Unknown</span>
    }},
    { key: 'screening', header: 'Screening', sortable: true, cell: (r) => SCREENING_TYPES.find(s => s.id === r.screening_type)?.short || '—' },
    { key: 'level', header: 'Level', sortable: true, cell: (r) => r.level },
    { key: 'duration', header: 'Duration', sortable: true, cell: (r) => `${r.duration} min` },
    { key: 'questions', header: 'Questions', sortable: true, cell: (r) => r.questions },
    { key: 'status', header: 'Status', cell: (r) => (
      <Badge variant={r.published ? 'success' : 'secondary'}>
        {r.published ? 'Published' : 'Draft'}
      </Badge>
    )},
    { key: 'stats', header: 'Stats', cell: (r) => (
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground whitespace-nowrap">
        <span>{r.invites || 0} invites sent</span>
        <span>{r.attempts || 0} submitted</span>
        <span>{r.released || 0} released</span>
      </div>
    )},
    { key: 'actions', header: '', cell: (r) => (
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="More options" aria-label="More options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => setTimeout(() => openInviteModal(r), 0)} disabled={!r.published} className="gap-2">
              <Send className="h-4 w-4" /> Invite candidate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTimeout(() => { setBulkInviteExam(r); setBulkCsvText(''); setBulkPreview(null); setBulkResults(null); setIsBulkInviteOpen(true) }, 0)} disabled={!r.published} className="gap-2">
              <Users className="h-4 w-4" /> Bulk invite
            </DropdownMenuItem>
            {r.published && (
              <DropdownMenuItem onSelect={() => setTimeout(() => openLinkDialog(r), 0)} className="gap-2">
                <Link2 className="h-4 w-4" /> Share links
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/assessments/${r.id}/results`)} className="gap-2">
              <Eye className="h-4 w-4" /> View results
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/assessments/${r.id}/edit`)} className="gap-2">
              <Edit className="h-4 w-4" /> Edit assessment
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDelete([r.id])} className="gap-2 text-destructive">
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
      <div className="relative isolate">
        <SoftGlow className="-inset-y-6 [mask-image:radial-gradient(ellipse_at_75%_45%,#000_30%,transparent_72%)]" />
        <PageHeader
          className="mb-0"
          title="Assessments"
          description="Build tests, invite candidates and review results."
          icon={<BookOpen />}
          actions={
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push('/dashboard/admin/assessments/bulk')}>
                <Upload className="w-4 h-4" />Bulk schedule
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push('/dashboard/admin/assessments/pipeline')}>
                <LayoutDashboard className="w-4 h-4" />Pipeline
              </Button>
              <Button className="gap-2" onClick={openAddModal}>
                <Plus className="w-4 h-4" />Add assessment
              </Button>
            </>
          }
        />
      </div>

      {!loading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Assessments" value={visibleExams.length} icon={<BookOpen />} />
          <StatCard label="Published" value={visibleExams.filter(e => e.published).length} icon={<CheckCircle2 />} />
          <StatCard label="Invites sent" value={visibleExams.reduce((n, e) => n + (e.invites || 0), 0)} icon={<Send />} />
          <StatCard label="Submitted" value={visibleExams.reduce((n, e) => n + (e.attempts || 0), 0)} icon={<Users />} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card p-3">
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
        <SkeletonTable rows={5} />
      ) : (
        <DataTable
          columns={columns}
          data={visibleExams}
          searchPlaceholder="Search assessments..."
          searchKeys={['title', 'subject', 'level', 'tenant_id']}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No assessments yet. Click 'Add assessment' to create your first test."
        />
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExam ? 'Edit assessment' : 'Create assessment'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4 py-4">
            <div className="col-span-1 sm:col-span-2 lg:col-span-3 grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. JavaScript Fundamentals" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subject">Target role / subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. QA Engineer, Full Stack Developer" />
            </div>
            <div className="grid gap-2">
              <Label>Level</Label>
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
              <Label>Screening type</Label>
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
              <Label htmlFor="startsAt">Available from (UTC, optional)</Label>
              <Input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endsAt">Submit-by deadline (UTC, optional)</Label>
              <Input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer" htmlFor="requireTokenLinks">
              <input
                id="requireTokenLinks"
                type="checkbox"
                checked={requireTokenLinks}
                onChange={(e) => setRequireTokenLinks(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-input accent-primary"
              />
              <span>
                Require personal links
                <span className="block text-xs text-muted-foreground font-normal">Disable legacy ?share=true URLs — candidates must use token links or invites.</span>
              </span>
            </label>
            <div className="sm:col-span-2 lg:col-span-3 rounded-lg border bg-muted/20 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Identity verification</p>
                <p className="text-xs text-muted-foreground">Turn off either step to let candidates skip it. Both off = consent only, exam starts directly.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-2 text-sm cursor-pointer" htmlFor="requireIdVerification">
                <input
                  id="requireIdVerification"
                  type="checkbox"
                  checked={requireIdVerification}
                  onChange={(e) => setRequireIdVerification(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-input accent-primary"
                />
                <span>
                  Require ID verification
                  <span className="block text-xs text-muted-foreground font-normal">Candidates capture/upload a Government ID (OCR name match). Off = skip ID step.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer" htmlFor="requireFaceCapture">
                <input
                  id="requireFaceCapture"
                  type="checkbox"
                  checked={requireFaceCapture}
                  onChange={(e) => setRequireFaceCapture(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-input accent-primary"
                />
                <span>
                  Require face capture
                  <span className="block text-xs text-muted-foreground font-normal">Candidates capture a live selfie (biometric verify + enroll). Off = skip face step.</span>
                </span>
              </label>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="questions">Questions</Label>
              <Input id="questions" type="number" min="0" value={questions} onChange={(e) => setQuestions(parseInt(e.target.value) || 0)} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 grid gap-2">
              <Label htmlFor="techStack">Topics / skills (comma separated)</Label>
              <Input id="techStack" value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="e.g. Selenium, TestNG, API Testing, SQL" />
            </div>
            <div className="flex items-center justify-between mt-2 sm:col-span-2 lg:col-span-3">
              <div className="space-y-0.5">
                <Label>Access</Label>
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
                  Invite only
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
                  Open to all
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 sm:col-span-2 lg:col-span-3">
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
            <Button onClick={handleSaveExam} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!editingExam && !saving && questions > 0 && <Wand2 className="mr-2 h-4 w-4" />}
              {!editingExam && !saving && questions === 0 && <Plus className="mr-2 h-4 w-4" />}
              {editingExam ? 'Save changes' : questions > 0 ? 'Generate with AI' : 'Create blank assessment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <SheetContent side="right" className="w-full sm:w-120 sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Invite candidate</SheetTitle>
            <SheetDescription>
              Send an assessment invitation to a candidate for <strong>{invitingExam?.title}</strong>.
            </SheetDescription>
          </SheetHeader>
          {!generatedLink ? (
            <form onSubmit={handleSendInvite} className="space-y-4 px-4 pb-4">
              <div className="space-y-2">
                <Label htmlFor="candName">Candidate name <span className="text-muted-foreground">(Optional)</span></Label>
                <Input id="candName" value={candName} onChange={(e) => setCandName(e.target.value)} placeholder="e.g. John Doe" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="candEmail">Email address *</Label>
                <Input id="candEmail" type="email" required value={candEmail} onChange={(e) => setCandEmail(e.target.value)} placeholder="candidate@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="candCc">CC email <span className="text-muted-foreground">(Optional)</span></Label>
                <Input id="candCc" type="email" value={candCc} onChange={(e) => setCandCc(e.target.value)} placeholder="manager@company.com" />
                <p className="text-xs text-muted-foreground">Copy this person on the invitation email</p>
              </div>
              <SheetFooter>
                <Button type="button" variant="outline" onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={sendingInvite || !candEmail}>
                  {sendingInvite && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send invite
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
                <Label>Invite link</Label>
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
        <DialogContent className="sm:max-w-150 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk invite candidates — {bulkInviteExam?.title}</DialogTitle>
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
                      {bulkResults.errors.map((e, i) => <p key={i} className="text-red-600 dark:text-red-400">{e}</p>)}
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
                  <div className="max-h-62.5 overflow-y-auto border rounded-md">
                    <Textarea
                      value={bulkCsvText}
                      onChange={(e) => { setBulkCsvText(e.target.value); setBulkPreview(null) }}
                      rows={8}
                      placeholder={'email,name\njohn@example.com,John\njane@example.com,Jane'}
                      className="font-mono text-sm min-h-37.5 border-0 focus-visible:ring-0 rounded-none"
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
                    <Upload className="h-3.5 w-3.5" /> Upload file
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
                          <span className="tabular-nums text-primary shrink-0 w-6">{i + 1}.</span>
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
                Send {bulkPreview?.length || 0} invites
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
        <DialogContent className="sm:max-w-160 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Share links — {linkExam?.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-5">
            <div className="grid gap-2">
              <Label>Link type</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLinkType('public')}
                  className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                    linkType === 'public'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  Public — anyone with the link
                </button>
                <button
                  type="button"
                  onClick={() => setLinkType('invited')}
                  className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                    linkType === 'invited'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  Invited — single candidate
                </button>
              </div>
            </div>
            {linkType === 'invited' && (
              <div className="grid gap-2">
                <Label htmlFor="linkEmail">Candidate email *</Label>
                <Input id="linkEmail" type="email" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="candidate@example.com" />
              </div>
            )}
            <div className="grid gap-2">
              <Label>Expiry</Label>
              <div className="flex gap-2 flex-wrap">
                {([['1h', '1 hour'], ['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['never', 'Never']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setLinkPreset(val)}
                    className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                      linkPreset === val
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setLinkPreset('custom')}
                  className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                    linkPreset === 'custom'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  Custom
                </button>
              </div>
              {linkPreset === 'custom' && (
                <Input type="datetime-local" value={linkCustom} onChange={(e) => setLinkCustom(e.target.value)} className="max-w-60" />
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="linkMaxUses">Max uses <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="linkMaxUses" type="number" min="1" value={linkMaxUses} onChange={(e) => setLinkMaxUses(e.target.value)} placeholder="Unlimited" className="max-w-40" />
            </div>
            {linkCreatedUrl && (
              <div className="space-y-2">
                <Label>New link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={linkCreatedUrl} className="font-mono text-sm break-all" />
                  <Button variant="secondary" onClick={() => {
                    navigator.clipboard.writeText(linkCreatedUrl)
                    addToast({ type: 'success', title: 'Copied!' })
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Active links for this assessment</Label>
              {linkLoading ? (
                <p className="text-sm text-muted-foreground">Loading links...</p>
              ) : linkRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No links yet. Set the options above and click 'Create & copy link'.</p>
              ) : (
                <div className="border rounded-md divide-y divide-border/40 max-h-72 overflow-y-auto">
                  {linkRows.map((l) => (
                    <div key={l.id} className="px-3 py-2 text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={l.revoked ? 'destructive' : 'secondary'}>{l.revoked ? 'revoked' : l.type}</Badge>
                        <span className="text-muted-foreground break-all flex-1 min-w-0" title={l.url}>{l.url}</span>
                        <span className="text-muted-foreground whitespace-nowrap shrink-0">
                          {l.expires_at ? formatDateTime(l.expires_at) : 'never'}
                          {l.max_uses ? ` · ${l.used_count}/${l.max_uses}` : ` · ${l.used_count} uses`}
                        </span>
                        {!l.revoked && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={() => void fetchUsage(linkExam?.id || '', l.id)}>
                              {usageLinkId === l.id ? <ChevronUp className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-destructive shrink-0" onClick={() => handleRevokeLink(l.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                      {/* Usage log expansion */}
                      {usageLinkId === l.id && (
                        <div className="mt-2 border-t border-border/40 pt-2">
                          {usageLoading ? (
                            <p className="text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading usage logs...</p>
                          ) : usageRows.length === 0 ? (
                            <p className="text-muted-foreground">No usage recorded yet.</p>
                          ) : (
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-muted-foreground px-2 pb-1 border-b border-border/30">
                                <span className="col-span-2">Time</span>
                                <span className="col-span-2">IP</span>
                                <span className="col-span-2">Device</span>
                                <span className="col-span-2">Browser</span>
                                <span className="col-span-2">OS</span>
                                <span className="col-span-2">User</span>
                              </div>
                              {usageRows.map((u) => (
                                <div key={u.id} className="grid grid-cols-12 gap-2 px-2 py-1 rounded hover:bg-muted/30">
                                  <span className="col-span-2 text-muted-foreground">{formatDateTime(u.accessed_at)}</span>
                                  <span className="col-span-2 font-mono text-muted-foreground">{u.ip_address || '—'}</span>
                                  <span className="col-span-2 flex items-center gap-1">
                                    {u.device_type === 'mobile' ? <Smartphone className="h-3 w-3" /> : u.device_type === 'tablet' ? <Tablet className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                                    {u.device_type}
                                  </span>
                                  <span className="col-span-2">{u.browser}</span>
                                  <span className="col-span-2">{u.os}</span>
                                  <span className="col-span-2 truncate" title={u.user_email || ''}>{u.user_name || u.user_email || 'Anonymous'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkOpen(false)}>Close</Button>
            <Button onClick={handleCreateLink} disabled={linkCreating || (linkType === 'invited' && !linkEmail.includes('@'))}>
              {linkCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              Create & copy link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

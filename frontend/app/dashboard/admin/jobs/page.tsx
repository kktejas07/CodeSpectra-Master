'use client'
import { formatDate } from '@/lib/format-datetime'
import { useConfirm } from '@/lib/confirm-context'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DataTable, type DataTableColumn, type BulkAction } from '@/components/ui/data-table'
import { usePageGuard } from '@/lib/use-page-guard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { ALL_CURRENCIES } from '@/lib/currency'
import { useToast } from '@/lib/toast-context'
import {
  Briefcase, Plus, Edit, Trash2, Eye, Users,
  Loader2, X, CheckCircle, AlertCircle,
} from 'lucide-react'
import { SkeletonStats, SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'
import { useAdminT } from '@/lib/i18n/admin'

interface JobPosting {
  id: string
  title: string
  company: string | null
  location: string | null
  job_type: string | null
  experience_level: string | null
  description: string | null
  requirements: string | null
  benefits: string | null
  skills: string[]
  salary: { min: number; max: number; currency: string } | null
  applicants: number
  created_at: string
  is_active: boolean
}

interface JobForm {
  title: string
  company: string
  location: string
  job_type: string
  experience_level: string
  description: string
  requirements: string
  benefits: string
  skills: string
  salary_min: string
  salary_max: string
  salary_currency: string
  is_active: boolean
}

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Remote']
const EXPERIENCE_LEVELS = ['Entry', 'Mid', 'Senior', 'Lead', 'Executive']
const CURRENCIES = ALL_CURRENCIES

const emptyForm: JobForm = {
  title: '', company: '', location: '', job_type: 'Full-time',
  experience_level: 'Mid', description: '', requirements: '',
  benefits: '', skills: '', salary_min: '', salary_max: '', salary_currency: 'USD', is_active: true,
}

export default function AdminJobsPage() {
  const { t: ta } = useAdminT()
  const confirmDialog = useConfirm()
  const gate = usePageGuard('superadmin')
  const addToast = useToast()
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<JobForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [loadError, setLoadError] = useState(false)

  const fetchJobs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/jobs?active=false')
      if (!res.ok) throw new Error(`Failed to load jobs (${res.status})`)
      const json = await res.json()
      if (json.data) setJobs(json.data)
      setLoadError(false)
    } catch (_e) { setLoadError(true); addToast({ type: 'error', title: 'Error', message: 'Failed to load jobs' }) } finally { setLoading(false) }
  }

  useEffect(() => { if (gate.ready) fetchJobs() }, [gate.ready])

  const openCreate = () => { setForm(emptyForm); setEditingId(null); setShowModal(true) }

  const openEdit = (job: JobPosting) => {
    setEditingId(job.id)
    setForm({
      title: job.title || '',
      company: job.company || '',
      location: job.location || '',
      job_type: job.job_type || 'Full-time',
      experience_level: job.experience_level || 'Mid',
      description: job.description || '',
      requirements: job.requirements || '',
      benefits: job.benefits || '',
      skills: (job.skills || []).join(', '),
      salary_min: job.salary?.min ? String(job.salary.min) : '',
      salary_max: job.salary?.max ? String(job.salary.max) : '',
      salary_currency: job.salary?.currency || 'USD',
      is_active: job.is_active !== false,
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.company.trim()) {
      addToast({ type: 'error', title: 'Error', message: 'Title and company are required' })
      return
    }
    setSaving(true)
    try {
      const skills = form.skills.split(',').map(s => s.trim()).filter(Boolean)
      const salary = form.salary_min && form.salary_max
        ? { min: Number(form.salary_min), max: Number(form.salary_max), currency: form.salary_currency }
        : null

      const payload = {
        title: form.title.trim(),
        company: form.company.trim(),
        location: form.location.trim() || null,
        job_type: form.job_type || null,
        experience_level: form.experience_level || null,
        description: form.description.trim() || null,
        requirements: form.requirements.trim() || null,
        benefits: form.benefits.trim() || null,
        skills,
        salary,
        is_active: form.is_active,
      }

      const res = editingId
        ? await csrfFetch(`/api/jobs/${editingId}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await csrfFetch('/api/jobs', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')

      addToast({
        type: 'success',
        title: editingId ? 'Job updated' : 'Job created',
        message: editingId ? 'Job has been updated.' : 'Job is now live.',
      })
      setShowModal(false)
      fetchJobs()
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: e instanceof Error ? e.message : 'Failed to save' })
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: 'Delete this job?', description: 'Delete this job posting? This cannot be undone.' })) return
    setDeletingId(id)
    try {
      const res = await csrfFetch(`/api/jobs/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error('Failed to delete')
      setJobs(j => j.filter(job => job.id !== id))
      addToast({ type: 'success', title: 'Deleted', message: 'Job posting removed.' })
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to delete job' })
    } finally { setDeletingId(null) }
  }

  const handleBulkDelete = async (ids: string[]) => {
    if (!await confirmDialog({ title: 'Delete jobs?', description: `Delete ${ids.length} job posting(s)? This cannot be undone.` })) return
    for (const id of ids) {
      await csrfFetch(`/api/jobs/${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} job(s) deleted` })
    setJobs(prev => prev.filter(j => !ids.includes(j.id)))
  }

  const toggleActive = async (job: JobPosting) => {
    try {
      const res = await csrfFetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !job.is_active }),
      })
      if (!res.ok) throw new Error()
      setJobs(j => j.map(jb => jb.id === job.id ? { ...jb, is_active: !jb.is_active } : jb))
      addToast({ type: 'success', title: 'Updated', message: `Job ${job.is_active ? 'deactivated' : 'activated'}.` })
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update status' })
    }
  }

  const getStatusColor = (job: JobPosting) =>
    !job.is_active ? 'bg-muted text-muted-foreground'
    : new Date(job.created_at).getTime() > Date.now() - 604800000
      ? 'border-primary/30 bg-primary/10 text-primary'
      : 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'

  const getStatusLabel = (job: JobPosting) =>
    !job.is_active ? 'Closed' : new Date(job.created_at).getTime() > Date.now() - 604800000 ? 'New' : 'Active'

  const columns: DataTableColumn<JobPosting>[] = [
    { key: 'title', header: 'Title', cell: (r) => <span className="font-medium text-foreground">{r.title}</span> },
    { key: 'company', header: 'Company', cell: (r) => r.company || '—' },
    { key: 'location', header: 'Location', cell: (r) => r.location || '—' },
    { key: 'job_type', header: 'Type', cell: (r) => r.job_type || '—' },
    { key: 'applicants', header: 'Applicants', cell: (r) => <span className="tabular-nums">{r.applicants || 0}</span> },
    {
      key: 'status', header: 'Status',
      cell: (r) => <Badge variant="outline" className={getStatusColor(r)}>{getStatusLabel(r)}</Badge>,
    },
    {
      key: 'created_at', header: 'Posted',
      cell: (r) => <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>,
    },
    {
      key: 'actions', header: 'Actions', className: 'text-right',
      cell: (r) => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" title={r.is_active ? 'Close this job' : 'Reopen this job'} aria-label={r.is_active ? 'Close this job' : 'Reopen this job'} onClick={() => toggleActive(r)}>
            {r.is_active ? <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" /> : <AlertCircle className="w-4 h-4 text-muted-foreground" />}
          </Button>
          <Button variant="ghost" size="sm" asChild title={ta('jobsAdm.view')}>
            <a href={`/jobs/${r.id}`} target="_blank" rel="noopener" aria-label={ta('jobsAdm.viewPublicJobPage')}>
              <Eye className="w-4 h-4" />
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)} title={ta('jobsAdm.edit')} aria-label={ta('jobsAdm.editJob')}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} title={ta('jobsAdm.delete')} aria-label={ta('jobsAdm.deleteJob')}>
            {deletingId === r.id
              ? <Loader2 className="w-4 h-4 animate-spin text-destructive" />
              : <Trash2 className="w-4 h-4 text-destructive" />}
          </Button>
        </div>
      ),
    },
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleBulkDelete },
  ]

  if (!gate.ready) return (
    <div className="space-y-6">
      <SkeletonStats />
      <SkeletonTable rows={5} />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="relative isolate">
        <SoftGlow className="-inset-y-6 [mask-image:radial-gradient(ellipse_at_75%_45%,#000_30%,transparent_72%)]" />
        <PageHeader
          illustration="jobs"
          title={ta('jobsAdm.jobPostings')}
          description={ta('jobsAdm.jobsListedOnThePublicJobs')}
          icon={<Briefcase />}
          actions={
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" /> {ta('jobsAdm.postAJob')}
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label={ta('jobsAdm.jobs')} value={jobs.length} icon={<Briefcase />} />
        <StatCard label={ta('jobsAdm.open')} value={jobs.filter(j => j.is_active).length} icon={<CheckCircle />} />
        <StatCard label={ta('jobsAdm.applicants')} value={jobs.reduce((s, j) => s + (j.applicants || 0), 0)} icon={<Users />} />
      </div>

      {loadError && jobs.length === 0 && !loading ? (
        <EmptyState
          illustration="error"
          title={ta('jobsAdm.couldnTLoadJobPostings')}
          description={ta('jobsAdm.checkYourConnectionAndTryAgain')}
          actionLabel={ta('jobsAdm.tryAgain')}
          onAction={() => void fetchJobs()}
        />
      ) : jobs.length === 0 && !loading ? (
        <EmptyState
          illustration="jobs"
          title={ta('jobsAdm.noJobPostingsYet')}
          description={ta('jobsAdm.postYourFirstOneAndIt')}
          actionLabel={ta('jobsAdm.postAJob')}
          onAction={openCreate}
        />
      ) : (
        <DataTable
          columns={columns}
          data={jobs}
          tableId="admin-jobs"
          searchPlaceholder="Search title, company..."
          searchKeys={['title', 'company'] as (keyof JobPosting)[]}
          bulkActions={bulkActions}
          loading={loading}
          emptyState={{ illustration: 'jobs' }} emptyMessage="No job postings yet."
          pageSize={20}
        />
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-3xl p-0 sm:max-w-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <DialogTitle className="text-lg font-semibold text-foreground">
                {editingId ? 'Edit job posting' : 'Post a new job'}
              </DialogTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)} aria-label={ta('jobsAdm.close')}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="job-title">{ta('jobsAdm.jobTitle')}</Label>
                  <Input id="job-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Senior Full-Stack Developer" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job-company">{ta('jobsAdm.company')}</Label>
                  <Input id="job-company" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Acme Corp" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job-location">{ta('jobsAdm.location')}</Label>
                  <Input id="job-location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder={ta('jobsAdm.remoteBangaloreIndia')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job-type">{ta('jobsAdm.jobType')}</Label>
                  <select
                    id="job-type" value={form.job_type}
                    onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job-level">{ta('jobsAdm.experienceLevel')}</Label>
                  <select
                    id="job-level" value={form.experience_level}
                    onChange={e => setForm(f => ({ ...f, experience_level: e.target.value }))}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job-currency">{ta('jobsAdm.currency')}</Label>
                  <select
                    id="job-currency" value={form.salary_currency}
                    onChange={e => setForm(f => ({ ...f, salary_currency: e.target.value }))}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job-salary-min">{ta('jobsAdm.salaryMin', { salary_currency: form.salary_currency })}</Label>
                  <Input type="number" id="job-salary-min" value={form.salary_min} onChange={e => setForm(f => ({ ...f, salary_min: e.target.value }))} placeholder="80000" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job-salary-max">{ta('jobsAdm.salaryMax', { salary_currency: form.salary_currency })}</Label>
                  <Input type="number" id="job-salary-max" value={form.salary_max} onChange={e => setForm(f => ({ ...f, salary_max: e.target.value }))} placeholder="120000" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="job-skills">{ta('jobsAdm.skillsCommaSeparated')}</Label>
                <Input id="job-skills" value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))} placeholder="React, TypeScript, Node.js, PostgreSQL" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-description">{ta('jobsAdm.jobDescription')}</Label>
                <Textarea rows={4} id="job-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={ta('jobsAdm.describeTheRoleResponsibilitiesAndWhat')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-requirements">{ta('jobsAdm.requirements')}</Label>
                <Textarea rows={3} id="job-requirements" value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} placeholder={ta('jobsAdm.listTheQualificationsSkillsAndExperience')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-benefits">{ta('jobsAdm.benefits')}</Label>
                <Textarea rows={3} id="job-benefits" value={form.benefits} onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))} placeholder={ta('jobsAdm.healthInsuranceRemoteWorkLearningBudget')} />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <Label htmlFor="is_active" className="text-sm font-normal">{ta('jobsAdm.activeVisibleToCandidates')}</Label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {saving ? 'Saving…' : editingId ? 'Update job' : 'Publish job'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowModal(false)} className="flex-1">
                  {ta('jobsAdm.cancel')}
                </Button>
              </div>
            </form>
          </DialogContent>
      </Dialog>
    </div>
  )
}

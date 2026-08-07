'use client'
import { useConfirm } from '@/lib/confirm-context'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
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

  const fetchJobs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/jobs?active=false')
      const json = await res.json()
      if (json.data) setJobs(json.data)
    } catch (_e) { addToast({ type: 'error', title: 'Error', message: 'Failed to load jobs' }) } finally { setLoading(false) }
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
        ? await fetch(`/api/jobs/${editingId}`, {
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
    if (!await confirmDialog({ title: 'Confirmation', description: 'Delete this job posting? This cannot be undone.' })) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error('Failed to delete')
      setJobs(j => j.filter(job => job.id !== id))
      addToast({ type: 'success', title: 'Deleted', message: 'Job posting removed.' })
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to delete job' })
    } finally { setDeletingId(null) }
  }

  const handleBulkDelete = async (ids: string[]) => {
    if (!await confirmDialog({ title: 'Confirmation', description: `Delete ${ids.length} job posting(s)? This cannot be undone.` })) return
    for (const id of ids) {
      await fetch(`/api/jobs/${id}`, { method: 'DELETE', credentials: 'include' })
    }
    addToast({ type: 'success', title: `${ids.length} job(s) deleted` })
    setJobs(prev => prev.filter(j => !ids.includes(j.id)))
  }

  const toggleActive = async (job: JobPosting) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
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
    !job.is_active ? 'bg-gray-500/20 text-gray-700'
    : new Date(job.created_at).getTime() > Date.now() - 604800000
      ? 'bg-green-500/20 text-green-700'
      : 'bg-blue-500/20 text-blue-700'

  const getStatusLabel = (job: JobPosting) =>
    !job.is_active ? 'Closed' : new Date(job.created_at).getTime() > Date.now() - 604800000 ? 'New' : 'Active'

  const columns: DataTableColumn<JobPosting>[] = [
    { key: 'title', header: 'Title', cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'company', header: 'Company', cell: (r) => r.company || '—' },
    { key: 'location', header: 'Location', cell: (r) => r.location || '—' },
    { key: 'job_type', header: 'Type', cell: (r) => r.job_type || '—' },
    { key: 'applicants', header: 'Applicants', cell: (r) => r.applicants || 0 },
    {
      key: 'status', header: 'Status',
      cell: (r) => <Badge className={getStatusColor(r)}>{getStatusLabel(r)}</Badge>,
    },
    {
      key: 'created_at', header: 'Posted',
      cell: (r) => <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>,
    },
    {
      key: 'actions', header: 'Actions', className: 'text-right',
      cell: (r) => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" title="Toggle active" onClick={() => toggleActive(r)}>
            {r.is_active ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-gray-400" />}
          </Button>
          <Button variant="ghost" size="sm" asChild title="View">
            <a href={`/jobs/${r.id}`} target="_blank" rel="noopener">
              <Eye className="w-4 h-4" />
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)} title="Edit">
            <Edit className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} title="Delete">
            {deletingId === r.id
              ? <Loader2 className="w-4 h-4 animate-spin text-red-600" />
              : <Trash2 className="w-4 h-4 text-red-600" />}
          </Button>
        </div>
      ),
    },
  ]

  const bulkActions: BulkAction[] = [
    { label: 'Delete', variant: 'destructive', icon: <Trash2 className="w-3.5 h-3.5 mr-1" />, onClick: handleBulkDelete },
  ]

  if (!gate.ready) return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-primary" />
            Job Postings
          </h1>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Post New Job
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Jobs</p>
          <p className="text-3xl font-bold">{jobs.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="text-3xl font-bold text-green-600">{jobs.filter(j => j.is_active).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Applicants</p>
          <p className="text-3xl font-bold text-primary">{jobs.reduce((s, j) => s + (j.applicants || 0), 0)}</p>
        </Card>
      </div>

      {jobs.length === 0 && !loading ? (
        <Card className="p-10 text-center">
          <Briefcase className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No job postings yet. Create your first one.</p>
          <Button className="mt-4" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Post a Job</Button>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={jobs}
          tableId="admin-jobs"
          searchPlaceholder="Search title, company..."
          searchKeys={['title', 'company'] as (keyof JobPosting)[]}
          bulkActions={bulkActions}
          loading={loading}
          emptyMessage="No job postings yet."
          pageSize={20}
        />
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-8">
          <Card className="w-full max-w-2xl m-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold">
                {editingId ? 'Edit Job Posting' : 'Post New Job'}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Job Title *</Label>
                  <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Senior Full-Stack Developer" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Company *</Label>
                  <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Acme Corp" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Remote / Bangalore, India" />
                </div>
                <div className="space-y-1.5">
                  <Label>Job Type</Label>
                  <select
                    value={form.job_type}
                    onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))}
                    className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Experience Level</Label>
                  <select
                    value={form.experience_level}
                    onChange={e => setForm(f => ({ ...f, experience_level: e.target.value }))}
                    className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <select
                    value={form.salary_currency}
                    onChange={e => setForm(f => ({ ...f, salary_currency: e.target.value }))}
                    className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Salary Min ({form.salary_currency})</Label>
                  <Input type="number" value={form.salary_min} onChange={e => setForm(f => ({ ...f, salary_min: e.target.value }))} placeholder="80000" />
                </div>
                <div className="space-y-1.5">
                  <Label>Salary Max ({form.salary_currency})</Label>
                  <Input type="number" value={form.salary_max} onChange={e => setForm(f => ({ ...f, salary_max: e.target.value }))} placeholder="120000" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Skills (comma-separated)</Label>
                <Input value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))} placeholder="React, TypeScript, Node.js, PostgreSQL" />
              </div>
              <div className="space-y-1.5">
                <Label>Job Description</Label>
                <Textarea rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the role, responsibilities, and what makes it exciting…" />
              </div>
              <div className="space-y-1.5">
                <Label>Requirements</Label>
                <Textarea rows={3} value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} placeholder="List the qualifications, skills, and experience needed…" />
              </div>
              <div className="space-y-1.5">
                <Label>Benefits</Label>
                <Textarea rows={3} value={form.benefits} onChange={e => setForm(f => ({ ...f, benefits: e.target.value }))} placeholder="Health insurance, remote work, learning budget, equity…" />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="is_active" className="text-sm font-normal">Active — visible to candidates</Label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {saving ? 'Saving…' : editingId ? 'Update Job' : 'Publish Job'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowModal(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}

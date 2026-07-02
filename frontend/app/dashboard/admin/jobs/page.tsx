'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Briefcase, Plus, Edit, Trash2, Eye } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

interface JobPosting {
  id: string
  title: string
  company: string
  location: string
  salary?: string
  applicants: number
  postedDate: string
  status: 'active' | 'closed' | 'draft'
}

export default function AdminJobsPage() {
  const gate = usePageGuard('superadmin')

  const [jobs, setJobs] = useState<JobPosting[]>([
    {
      id: '1',
      title: 'Senior Full-Stack Developer',
      company: 'Tech Corp',
      location: 'San Francisco, CA',
      salary: '$150k - $200k',
      applicants: 24,
      postedDate: '2024-04-15',
      status: 'active',
    },
    {
      id: '2',
      title: 'Frontend Engineer',
      company: 'StartUp Inc',
      location: 'Remote',
      salary: '$120k - $160k',
      applicants: 18,
      postedDate: '2024-04-10',
      status: 'active',
    },
    {
      id: '3',
      title: 'DevOps Engineer (Closed)',
      company: 'Cloud Systems',
      location: 'New York, NY',
      salary: '$140k - $190k',
      applicants: 12,
      postedDate: '2024-03-15',
      status: 'closed',
    },
  ])

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newJob, setNewJob] = useState({ title: '', company: '', location: '' })

  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault()
    const job: JobPosting = {
      id: String(jobs.length + 1),
      ...newJob,
      salary: '',
      applicants: 0,
      postedDate: new Date().toISOString().split('T')[0],
      status: 'draft',
    }
    setJobs([job, ...jobs])
    setNewJob({ title: '', company: '', location: '' })
    setShowCreateModal(false)
  }

  const handleDelete = (id: string) => {
    setJobs(jobs.filter(j => j.id !== id))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-700'
      case 'closed':
        return 'bg-gray-500/20 text-gray-700'
      case 'draft':
        return 'bg-yellow-500/20 text-yellow-700'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Briefcase className="w-8 h-8 text-primary" />
            Job Postings Management
          </h1>
          <p className="text-muted-foreground mt-2">Manage all job postings on the platform</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Post New Job
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Jobs</p>
          <p className="text-3xl font-bold text-foreground">{jobs.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="text-3xl font-bold text-green-600">{jobs.filter(j => j.status === 'active').length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Applicants</p>
          <p className="text-3xl font-bold text-primary">{jobs.reduce((sum, j) => sum + j.applicants, 0)}</p>
        </Card>
      </div>

      {/* Jobs Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Title</th>
                <th className="px-6 py-3 text-left font-semibold">Company</th>
                <th className="px-6 py-3 text-left font-semibold">Location</th>
                <th className="px-6 py-3 text-left font-semibold">Applicants</th>
                <th className="px-6 py-3 text-left font-semibold">Status</th>
                <th className="px-6 py-3 text-left font-semibold">Posted</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-6 py-3 font-medium">{job.title}</td>
                  <td className="px-6 py-3">{job.company}</td>
                  <td className="px-6 py-3">{job.location}</td>
                  <td className="px-6 py-3">{job.applicants}</td>
                  <td className="px-6 py-3">
                    <Badge className={getStatusColor(job.status)}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-xs text-muted-foreground">{job.postedDate}</td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(job.id)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Job Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Post New Job</h2>
            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Job Title</label>
                <input
                  type="text"
                  value={newJob.title}
                  onChange={(e) => setNewJob({ ...newJob, title: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Company</label>
                <input
                  type="text"
                  value={newJob.company}
                  onChange={(e) => setNewJob({ ...newJob, company: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Location</label>
                <input
                  type="text"
                  value={newJob.location}
                  onChange={(e) => setNewJob({ ...newJob, location: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
                  required
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  Create Job
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1"
                >
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

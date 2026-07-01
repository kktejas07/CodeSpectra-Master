'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/toast-context'
import { DollarSign, Briefcase, MapPinIcon, Loader, Search } from 'lucide-react'

interface JobPosting {
  id: string
  title: string
  company: string
  location: string
  salary?: { min: number; max: number; currency: string }
  jobType: string
  experienceLevel: string
  description: string
  skills: string[]
  applicants: number
  postedAt: string
}

export default function JobsPage() {
  const addToast = useToast()
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState({ location: '', jobType: '', level: '' })

  useEffect(() => {
    fetch('/api/jobs')
      .then(r => r.json())
      .then(json => { if (json.data) setJobs(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = (job.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || (job.company || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesLocation = !filter.location || job.location.includes(filter.location)
    const matchesType = !filter.jobType || job.jobType === filter.jobType
    const matchesLevel = !filter.level || job.experienceLevel === filter.level
    return matchesSearch && matchesLocation && matchesType && matchesLevel
  })

  if (loading) return <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Jobs</h1>
        <p className="text-muted-foreground mt-1">Find your next opportunity</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search jobs by title or company..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {jobs.length === 0 ? (
        <Card className="border-border/60 p-10 text-center">
          <Briefcase className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">No job listings available yet.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredJobs.map(job => (
            <Card key={job.id} className="border-border/60 p-5">
              <h3 className="mb-1 font-semibold text-foreground">{job.title}</h3>
              <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{job.company}</span>
                <span className="flex items-center gap-1"><MapPinIcon className="h-3 w-3" />{job.location}</span>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {job.skills.map(s => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
              </div>
              <p className="mb-4 line-clamp-2 text-xs text-muted-foreground">{job.description}</p>
              <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
                {job.salary && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />${(job.salary.min / 1000).toFixed(0)}k-${(job.salary.max / 1000).toFixed(0)}k</span>}
                <span>{job.jobType}</span>
                <span>{job.applicants} applicants</span>
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => addToast({ type: 'info', title: 'Coming soon', message: 'Job application feature is coming soon!' })}>Apply Now</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

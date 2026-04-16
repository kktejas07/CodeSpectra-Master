'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin, DollarSign, Briefcase, Plus } from 'lucide-react'

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
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ location: '', jobType: '', level: '' })

  useEffect(() => {
    fetchJobs()
  }, [filter])

  const fetchJobs = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams(Object.entries(filter).filter(([, v]) => v))
      const res = await fetch(`/api/jobs?${params}`)
      const data = await res.json()
      setJobs(data)
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/apply`, { method: 'POST' })
      if (res.ok) {
        alert('Application submitted successfully!')
        fetchJobs()
      }
    } catch (error) {
      console.error('Failed to apply:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Job Opportunities</h1>
        <p className="text-muted-foreground">Browse and apply for positions</p>
      </div>

      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Location"
            value={filter.location}
            onChange={(e) => setFilter({ ...filter, location: e.target.value })}
            className="px-3 py-2 border rounded-md text-sm"
          />
          <select
            value={filter.jobType}
            onChange={(e) => setFilter({ ...filter, jobType: e.target.value })}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">Job Type</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="remote">Remote</option>
          </select>
          <select
            value={filter.level}
            onChange={(e) => setFilter({ ...filter, level: e.target.value })}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="">Experience Level</option>
            <option value="entry">Entry Level</option>
            <option value="mid">Mid Level</option>
            <option value="senior">Senior</option>
          </select>
          <Button onClick={fetchJobs} className="w-full">Search</Button>
        </div>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <Card className="p-6 text-center">Loading jobs...</Card>
        ) : jobs.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">No jobs found</Card>
        ) : (
          jobs.map((job) => (
            <Card key={job.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-1">{job.title}</h3>
                  <p className="text-muted-foreground mb-3">{job.company}</p>
                </div>
                <Badge variant="outline">{job.jobType}</Badge>
              </div>

              <p className="text-sm text-muted-foreground mb-4">{job.description.substring(0, 150)}...</p>

              <div className="flex flex-wrap gap-3 mb-4 text-sm">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {job.location}
                </span>
                {job.salary && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    {job.salary.currency} {job.salary.min.toLocaleString()} - {job.salary.max.toLocaleString()}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Briefcase className="w-4 h-4" />
                  {job.experienceLevel}
                </span>
              </div>

              <div className="flex flex-wrap gap-1 mb-4">
                {job.skills.slice(0, 5).map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>

              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">{job.applicants} applicants</p>
                <Button onClick={() => handleApply(job.id)}>Apply Now</Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

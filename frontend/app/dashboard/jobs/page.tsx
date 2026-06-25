'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DollarSign, Briefcase, Heart, Share2, MapPinIcon } from 'lucide-react'

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
  liked?: boolean
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobPosting[]>([
    {
      id: '1',
      title: 'Senior Full-Stack Developer',
      company: 'Tech Corp',
      location: 'San Francisco, CA',
      salary: { min: 150000, max: 200000, currency: 'USD' },
      jobType: 'Full-time',
      experienceLevel: 'Senior',
      description: 'Looking for experienced full-stack developer to join our team',
      skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL'],
      applicants: 24,
      postedAt: '2 days ago',
      liked: false,
    },
    {
      id: '2',
      title: 'Frontend Engineer',
      company: 'StartUp Inc',
      location: 'Remote',
      salary: { min: 120000, max: 160000, currency: 'USD' },
      jobType: 'Full-time',
      experienceLevel: 'Mid-level',
      description: 'Help build beautiful user interfaces for our platform',
      skills: ['React', 'TypeScript', 'Tailwind CSS', 'Next.js'],
      applicants: 18,
      postedAt: '5 days ago',
      liked: false,
    },
    {
      id: '3',
      title: 'DevOps Engineer',
      company: 'Cloud Systems',
      location: 'New York, NY',
      salary: { min: 140000, max: 190000, currency: 'USD' },
      jobType: 'Full-time',
      experienceLevel: 'Senior',
      description: 'Manage and optimize our cloud infrastructure',
      skills: ['Kubernetes', 'Docker', 'AWS', 'Python'],
      applicants: 12,
      postedAt: '1 week ago',
      liked: false,
    },
  ])

  const [filter, setFilter] = useState({ location: '', jobType: '', level: '' })
  const [searchTerm, setSearchTerm] = useState('')

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.company.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesLocation = !filter.location || job.location.includes(filter.location)
    const matchesJobType = !filter.jobType || job.jobType === filter.jobType
    const matchesLevel = !filter.level || job.experienceLevel === filter.level
    return matchesSearch && matchesLocation && matchesJobType && matchesLevel
  })

  const handleApply = (jobId: string) => {
    console.log('Applied to job:', jobId)
    alert('Application submitted successfully!')
  }

  const handleLike = (jobId: string) => {
    setJobs(jobs.map(job => 
      job.id === jobId ? { ...job, liked: !job.liked } : job
    ))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Briefcase className="w-8 h-8 text-primary" />
            Job Opportunities
          </h1>
          <p className="text-muted-foreground mt-2">Find your next career opportunity</p>
        </div>
      </div>

      {/* Search and Filters */}
      <Card className="p-4 space-y-4">
        <div>
          <input
            type="text"
            placeholder="Search jobs by title or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Location</label>
            <select
              value={filter.location}
              onChange={(e) => setFilter({ ...filter, location: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
            >
              <option value="">All locations</option>
              <option value="San Francisco">San Francisco</option>
              <option value="Remote">Remote</option>
              <option value="New York">New York</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Job Type</label>
            <select
              value={filter.jobType}
              onChange={(e) => setFilter({ ...filter, jobType: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
            >
              <option value="">All types</option>
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Experience Level</label>
            <select
              value={filter.level}
              onChange={(e) => setFilter({ ...filter, level: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
            >
              <option value="">All levels</option>
              <option value="Junior">Junior</option>
              <option value="Mid-level">Mid-level</option>
              <option value="Senior">Senior</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Jobs List */}
      <div className="space-y-4">
        {filteredJobs.map((job) => (
          <Card key={job.id} className="p-6 hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-xl font-bold text-foreground mb-2">{job.title}</h3>
                <p className="text-muted-foreground mb-3">{job.company}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant="outline" className="gap-1">
                    <MapPinIcon className="w-3 h-3" />
                    {job.location}
                  </Badge>
                  <Badge variant="outline">{job.jobType}</Badge>
                  <Badge variant="outline">{job.experienceLevel}</Badge>
                  {job.salary && (
                    <Badge variant="outline" className="gap-1">
                      <DollarSign className="w-3 h-3" />
                      ${job.salary.min}k - ${job.salary.max}k
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground mb-3">{job.description}</p>
                <div className="flex flex-wrap gap-2">
                  {job.skills.map((skill) => (
                    <Badge key={skill} className="bg-primary/20 text-primary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground">
                {job.applicants} applicants • Posted {job.postedAt}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleLike(job.id)}
                  className={job.liked ? 'text-red-500' : ''}
                >
                  <Heart className={`w-4 h-4 ${job.liked ? 'fill-current' : ''}`} />
                </Button>
                <Button variant="outline" size="sm" className="gap-1">
                  <Share2 className="w-4 h-4" />
                  Share
                </Button>
                <Button onClick={() => handleApply(job.id)}>Apply Now</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredJobs.length === 0 && (
        <Card className="p-12 text-center">
          <Briefcase className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">No jobs found</p>
          <p className="text-muted-foreground text-sm">Try adjusting your search filters</p>
        </Card>
      )}
    </div>
  )
}

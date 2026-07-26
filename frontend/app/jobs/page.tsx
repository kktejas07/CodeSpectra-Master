'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Search, Briefcase, MapPinIcon, DollarSign, Clock,
  Filter, X, Loader2, ArrowRight, Building2,
} from 'lucide-react'

interface JobPosting {
  id: string
  title: string
  company: string | null
  location: string | null
  job_type: string | null
  experience_level: string | null
  description: string | null
  skills: string[]
  salary: { min: number; max: number; currency: string } | null
  applicants: number
  created_at: string
  is_active: boolean
}

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Remote']
const EXPERIENCE_LEVELS = ['Entry', 'Mid', 'Senior', 'Lead', 'Executive']

function formatSalary(salary: JobPosting['salary']) {
  if (!salary) return null
  const fmt = (n: number) =>
    salary.currency === 'INR'
      ? `₹${(n / 100000).toFixed(1)}L`
      : `$${(n / 1000).toFixed(0)}k`
  return `${fmt(salary.min)} – ${fmt(salary.max)}`
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export default function JobsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [filterType, setFilterType] = useState(searchParams.get('type') || '')
  const [filterLevel, setFilterLevel] = useState(searchParams.get('level') || '')
  const [filterLocation, setFilterLocation] = useState(searchParams.get('loc') || '')
  const [showFilters, setShowFilters] = useState(false)
  const [applied, setApplied] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/jobs')
      .then(r => r.json())
      .then(json => { if (json.data) setJobs(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = jobs.filter(job => {
    const q = search.toLowerCase()
    const matchQ = !q
      || (job.title || '').toLowerCase().includes(q)
      || (job.company || '').toLowerCase().includes(q)
      || (job.skills || []).some(s => s.toLowerCase().includes(q))
    const matchType = !filterType || (job.job_type || '').toLowerCase() === filterType.toLowerCase()
    const matchLevel = !filterLevel || (job.experience_level || '').toLowerCase() === filterLevel.toLowerCase()
    const matchLoc = !filterLocation || (job.location || '').toLowerCase().includes(filterLocation.toLowerCase())
    return matchQ && matchType && matchLevel && matchLoc
  })

  const clearFilters = () => { setFilterType(''); setFilterLevel(''); setFilterLocation('') }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Job Board</h1>
              <p className="text-sm text-muted-foreground">
                {loading ? 'Loading…' : `${filtered.length} open position${filtered.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)} className="gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Filters
              {(filterType || filterLevel || filterLocation) && (
                <Badge variant="default" className="ml-1 text-[10px] h-4 px-1">
                  {[filterType, filterLevel, filterLocation].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by title, company, or skill…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {showFilters && (
            <div className="mt-3 flex flex-wrap gap-3">
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">Job Type</option>
                {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={filterLevel}
                onChange={e => setFilterLevel(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">Experience</option>
                {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <Input
                placeholder="Location…"
                value={filterLocation}
                onChange={e => setFilterLocation(e.target.value)}
                className="h-9 w-40 text-sm"
              />
              {(filterType || filterLevel || filterLocation) && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1">
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-border/60 p-12 text-center">
            <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-3 text-lg font-medium">No jobs found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || filterType || filterLevel || filterLocation
                ? 'Try adjusting your search or filters.'
                : 'No open positions right now — check back soon.'}
            </p>
            {(search || filterType || filterLevel || filterLocation) && (
              <Button variant="outline" className="mt-4" onClick={() => { setSearch(''); clearFilters() }}>
                Clear search
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(job => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="group">
                <Card className="border-border/60 p-5 h-full hover:border-primary/40 hover:shadow-md transition-all duration-200 cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {job.title || 'Untitled'}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5 text-sm text-muted-foreground">
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{job.company || 'Company'}</span>
                      </div>
                    </div>
                    {job.job_type && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {job.job_type}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                    {job.location && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPinIcon className="h-3 w-3 shrink-0" />
                        {job.location}
                      </span>
                    )}
                    {job.experience_level && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        {job.experience_level}
                      </span>
                    )}
                  </div>

                  {job.skills && job.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {job.skills.slice(0, 4).map(s => (
                        <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                      ))}
                      {job.skills.length > 4 && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          +{job.skills.length - 4}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-3 text-xs">
                      {job.salary && (
                        <span className="flex items-center gap-1 text-green-600 font-medium">
                          <DollarSign className="h-3 w-3" />
                          {formatSalary(job.salary)}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {job.applicants} applicant{job.applicants !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {timeAgo(job.created_at)}
                      <ArrowRight className="h-3 w-3 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
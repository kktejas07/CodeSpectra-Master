'use client'

import { useEffect, useState } from 'react'
import { PublicPageWrapper } from '@/app/public-layout'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Search, MapPinIcon, DollarSign, Clock,
  Filter, X, Loader2, ArrowRight, Building2,
} from 'lucide-react'
import { useCurrency } from '@/lib/use-currency'
import { PageHero } from '@/components/landing/page-hero'
import { DeviceShowcase } from '@/components/visuals'
import { EmptyState } from '@/components/ui/empty-state'

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

function formatSalary(salary: JobPosting['salary'], symbol: string) {
  if (!salary) return null
  const fmt = (n: number) =>
    salary.currency === 'INR'
      ? `${symbol}${(n / 100000).toFixed(1)}L`
      : `${symbol}${(n / 1000).toFixed(0)}k`
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
  const { symbol } = useCurrency()
  const searchParams = useSearchParams()
  const [jobs, setJobs] = useState<JobPosting[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [filterType, setFilterType] = useState(searchParams.get('type') || '')
  const [filterLevel, setFilterLevel] = useState(searchParams.get('level') || '')
  const [filterLocation, setFilterLocation] = useState(searchParams.get('loc') || '')
  const [showFilters, setShowFilters] = useState(false)
  const [applied, setApplied] = useState<Set<string>>(new Set())

  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    fetch('/api/jobs')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(json => { setJobs(Array.isArray(json.data) ? json.data : []) })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [reloadKey])

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
    <PublicPageWrapper>
      <PageHero
        title="Job board"
        lead="Open roles posted on CodeSpectra. Search by title, company or skill, then open a role to read the details and apply."
        art={<DeviceShowcase variant="candidate" compact />}
      />
      <div className="sticky top-16 z-30 border-b border-cs-grid bg-cs-paper/90 backdrop-blur">
        <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-cs-ink-soft" aria-live="polite">
              {loading ? 'Loading…' : <><span className="tabular-nums text-cs-ink">{filtered.length}</span> open position{filtered.length !== 1 ? 's' : ''}</>}
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)} className="gap-1.5 rounded-full" aria-expanded={showFilters} aria-controls="job-filters">
              <Filter className="h-3.5 w-3.5" aria-hidden /> Filters
              {(filterType || filterLevel || filterLocation) && (
                <Badge variant="default" className="ml-1 h-4 px-1 text-[10px] tabular-nums">
                  {[filterType, filterLevel, filterLocation].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cs-ink-soft" aria-hidden />
            <Input
              placeholder="Search by title, company, or skill…"
              aria-label="Search jobs"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-11 rounded-full border-cs-grid bg-cs-sheet pl-11 text-cs-ink"
            />
          </div>

          {showFilters && (
            <div id="job-filters" className="mt-3 flex flex-wrap gap-3">
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                aria-label="Job type"
                className="h-9 rounded-full border border-cs-grid bg-cs-sheet px-3 text-sm text-cs-ink"
              >
                <option value="">Job type</option>
                {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={filterLevel}
                onChange={e => setFilterLevel(e.target.value)}
                aria-label="Experience level"
                className="h-9 rounded-full border border-cs-grid bg-cs-sheet px-3 text-sm text-cs-ink"
              >
                <option value="">Experience</option>
                {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <Input
                placeholder="Location…"
                aria-label="Location"
                value={filterLocation}
                onChange={e => setFilterLocation(e.target.value)}
                className="h-9 w-40 rounded-full border-cs-grid bg-cs-sheet text-sm text-cs-ink"
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

      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-cs-ink-soft motion-reduce:animate-none" aria-label="Loading jobs" />
          </div>
        ) : loadError ? (
          <EmptyState
            illustration="jobs"
            title="We couldn't load jobs"
            description="Something went wrong on our side. Try again in a moment."
            actionLabel="Try again"
            onAction={() => setReloadKey(k => k + 1)}
          />
        ) : filtered.length === 0 ? (
          (search || filterType || filterLevel || filterLocation) ? (
            <EmptyState
              variant="search"
              title="No jobs match your search"
              description="Try adjusting your search or filters."
              actionLabel="Clear search"
              onAction={() => { setSearch(''); clearFilters() }}
            />
          ) : (
            <EmptyState illustration="jobs" title="No open positions right now" description="Check back soon. New roles appear here as soon as they’re posted." />
          )
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map(job => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="group block h-full rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-cs-accent/40 hover:shadow-[0_18px_40px_-18px_rgba(47,91,231,0.35)] motion-reduce:hover:translate-y-0 dark:shadow-none"
              >
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="line-clamp-1 text-lg font-bold tracking-tight text-cs-ink transition-colors group-hover:text-cs-accent-text">
                        {job.title || 'Untitled'}
                      </h3>
                      <div className="mt-0.5 flex items-center gap-1.5 text-sm text-cs-ink-soft">
                        <Building2 className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{job.company || 'Company'}</span>
                      </div>
                    </div>
                    {job.job_type && (
                      <Badge variant="secondary" className="shrink-0 bg-cs-accent/10 text-[11px] text-cs-accent-text">
                        {job.job_type}
                      </Badge>
                    )}
                  </div>

                  <div className="mb-3 flex items-center gap-3 text-xs text-cs-ink-soft">
                    {job.location && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPinIcon className="h-3 w-3 shrink-0" aria-hidden />
                        {job.location}
                      </span>
                    )}
                    {job.experience_level && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" aria-hidden />
                        {job.experience_level}
                      </span>
                    )}
                  </div>

                  {job.skills && job.skills.length > 0 && (
                     <div className="flex flex-wrap gap-1 mb-3">
                      {job.skills.slice(0, 4).map(s => (
                        <Badge key={s} variant="outline" className="border-cs-grid text-[11px] text-cs-ink">{s}</Badge>
                      ))}
                      {job.skills.length > 4 && (
                        <Badge variant="outline" className="border-cs-grid text-[11px] text-cs-ink-soft">
                          +{job.skills.length - 4}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between border-t border-cs-grid pt-3">
                    <div className="flex items-center gap-3 text-xs">
                      {job.salary && (
                        <span className="flex items-center gap-1 font-semibold tabular-nums text-cs-ink">
                          <DollarSign className="h-3 w-3" aria-hidden />
                          {formatSalary(job.salary, symbol)}
                        </span>
                      )}
                      <span className="tabular-nums text-cs-ink-soft">
                        {job.applicants} applicant{job.applicants !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-cs-ink-soft">
                      {timeAgo(job.created_at)}
                      <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-cs-accent-text motion-reduce:group-hover:translate-x-0" aria-hidden />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PublicPageWrapper>
  )
}
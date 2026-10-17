'use client'
import { formatDate } from '@/lib/format-datetime'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PublicPageWrapper } from '@/app/public-layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft, Building2, MapPinIcon, DollarSign, Clock, Briefcase,
  CheckCircle, Loader2, AlertCircle, ExternalLink, Users, Calendar,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useCurrency } from '@/lib/use-currency'

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

function formatSalary(salary: JobPosting['salary'], symbol: string) {
  if (!salary) return null
  const fmt = (n: number) =>
    salary.currency === 'INR'
      ? `${symbol}${(n / 100000).toFixed(1)}L`
      : `${symbol}${(n / 1000).toFixed(0)}k`
  return `${fmt(salary.min)} – ${fmt(salary.max)}`
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { symbol } = useCurrency()
  const { user: authUser } = useAuth()
  const [job, setJob] = useState<JobPosting | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applySuccess, setApplySuccess] = useState(false)
  const [alreadyApplied, setAlreadyApplied] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  const [applyError, setApplyError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${id}`)
      if (!res.ok) { setError('Job not found'); return }
      const data = await res.json()
      setJob(data)
    } catch { setError('Failed to load job') } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const handleApply = async () => {
    if (!authUser) { router.push('/login'); return }
    setApplying(true); setApplyError(null)
    try {
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' })
      const { csrfToken } = await csrfRes.json()
      const res = await fetch(`/api/jobs/${id}/apply`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ coverLetter }),
      })
      const data = await res.json()
      if (data.alreadyApplied) {
        setAlreadyApplied(true)
      } else if (data.success) {
        setApplySuccess(true)
        setJob(j => j ? { ...j, applicants: j.applicants + 1 } : j)
      } else {
        setApplyError(data.error || 'Failed to apply')
      }
    } catch { setApplyError('Something went wrong') } finally { setApplying(false) }
  }

  if (loading) return (
    <PublicPageWrapper>
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-cs-ink-soft motion-reduce:animate-none" aria-label="Loading job" />
      </div>
    </PublicPageWrapper>
  )

  if (error || !job) return (
    <PublicPageWrapper>
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-cs-ink-soft/40" aria-hidden />
        <p className="mt-3 text-lg font-semibold text-cs-ink">{error || 'Job not found'}</p>
        <p className="mt-1 text-sm text-cs-ink-soft">It may have been filled or removed. The job board has every open role.</p>
        <Button variant="outline" className="mt-5 rounded-full" onClick={() => router.push('/jobs')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to jobs
        </Button>
      </div>
    </PublicPageWrapper>
  )

  const salary = formatSalary(job.salary, symbol)

  return (
    <PublicPageWrapper>
      <div className="relative isolate overflow-hidden border-b border-cs-grid">
        <div aria-hidden className="absolute -top-32 right-[-10%] -z-10 h-[420px] w-[520px] rounded-full bg-[#2f5be7]/10 blur-3xl" />
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Link href="/jobs" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-cs-ink-soft hover:text-cs-accent-text">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All jobs
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="cs-display max-w-[24ch] text-4xl sm:text-5xl">{job.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-cs-ink-soft">
                {job.company && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" aria-hidden />{job.company}
                  </span>
                )}
                {job.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPinIcon className="h-4 w-4" aria-hidden />{job.location}
                  </span>
                )}
                {job.job_type && (
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" aria-hidden />{job.job_type}
                  </span>
                )}
                {job.experience_level && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" aria-hidden />{job.experience_level}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" aria-hidden /><span className="tabular-nums">{job.applicants}</span> applicant{job.applicants !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" aria-hidden />
                  Posted {formatDate(job.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {job.description && (
              <section className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none">
                <h2 className="mb-3 text-lg font-bold text-cs-ink">About the role</h2>
                <div className="max-w-[72ch] whitespace-pre-wrap text-[15px] leading-7 text-cs-ink-soft">
                  {job.description}
                </div>
              </section>
            )}

            {job.requirements && (
              <section className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none">
                <h2 className="mb-3 text-lg font-bold text-cs-ink">Requirements</h2>
                <div className="max-w-[72ch] whitespace-pre-wrap text-[15px] leading-7 text-cs-ink-soft">
                  {job.requirements}
                </div>
              </section>
            )}

            {job.benefits && (
              <section className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none">
                <h2 className="mb-3 text-lg font-bold text-cs-ink">Benefits</h2>
                <div className="max-w-[72ch] whitespace-pre-wrap text-[15px] leading-7 text-cs-ink-soft">
                  {job.benefits}
                </div>
              </section>
            )}

            {job.skills && job.skills.length > 0 && (
              <section className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none">
                <h2 className="mb-3 text-lg font-bold text-cs-ink">Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {job.skills.map(s => (
                    <Badge key={s} variant="secondary" className="bg-cs-accent/10 text-cs-accent-text">{s}</Badge>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none sticky top-20 p-5">
              {salary && (
                <div className="mb-4 flex items-center gap-2 rounded-2xl border border-cs-accent/20 bg-cs-accent/5 p-3">
                  <DollarSign className="h-4 w-4 text-cs-accent-text" aria-hidden />
                  <span className="text-sm font-semibold tabular-nums text-cs-ink">{salary}</span>
                </div>
              )}

              {applySuccess ? (
                <div className="py-4 text-center" role="status">
                  <CheckCircle className="mx-auto mb-2 h-10 w-10 text-green-600 dark:text-green-400" aria-hidden />
                  <p className="font-semibold text-cs-ink">Application submitted!</p>
                  <p className="mt-1 text-sm text-cs-ink-soft">Good luck with your application.</p>
                </div>
              ) : alreadyApplied ? (
                <div className="text-center py-4">
                  <CheckCircle className="mx-auto mb-2 h-10 w-10 text-cs-ink-soft" aria-hidden />
                  <p className="font-semibold text-cs-ink">Already applied</p>
                  <p className="mt-1 text-sm text-cs-ink-soft">Your application is under review.</p>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-base font-bold text-cs-ink">
                    Apply for this position
                  </p>
                  {authUser ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="cover-letter" className="text-xs text-cs-ink">Cover letter (optional)</Label>
                        <Textarea
                          id="cover-letter"
                          rows={3}
                          value={coverLetter}
                          onChange={e => setCoverLetter(e.target.value)}
                          placeholder="Tell the company why you're a great fit…"
                          className="text-sm"
                        />
                      </div>
                      {applyError && (
                        <p role="alert" className="flex items-center gap-1 text-xs text-cs-flag">
                          <AlertCircle className="h-3 w-3" aria-hidden />{applyError}
                        </p>
                      )}
                      <Button className="h-11 w-full rounded-full" onClick={handleApply} disabled={applying}>
                        {applying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        {applying ? 'Submitting…' : 'Submit application'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 text-center">
                      <p className="text-sm text-cs-ink-soft">Sign in to apply for this position</p>
                      <Button className="h-11 w-full rounded-full" onClick={() => router.push('/login')}>
                        Sign in to apply
                      </Button>
                      <p className="text-xs text-cs-ink-soft">
                        Don&apos;t have an account?{' '}
                        <Link href="/signup" className="font-medium text-cs-accent-text hover:underline">Sign up free</Link>
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="mt-4 border-t border-cs-grid pt-4 text-center text-xs text-cs-ink-soft">
                <span className="flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Posted {formatDate(job.created_at)}
                </span>
                <span className="flex items-center justify-center gap-1 mt-1">
                  <Users className="h-3 w-3" aria-hidden />
                  <span className="tabular-nums">{job.applicants}</span> applicant{job.applicants !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <Button variant="outline" className="w-full gap-1.5 rounded-full" asChild>
              <Link href="/jobs"><ArrowLeft className="h-4 w-4" /> Back to jobs</Link>
            </Button>
          </div>
        </div>
      </div>
    </PublicPageWrapper>
  )
}
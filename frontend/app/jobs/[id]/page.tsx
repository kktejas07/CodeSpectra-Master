'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
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
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )

  if (error || !job) return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/40" />
      <p className="mt-3 text-lg font-medium">{error || 'Job not found'}</p>
      <Button variant="outline" className="mt-4" onClick={() => router.push('/jobs')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Jobs
      </Button>
    </div>
  )

  const salary = formatSalary(job.salary, symbol)

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/jobs"><ArrowLeft className="h-4 w-4 mr-1" /> All Jobs</Link>
          </Button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{job.title}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                {job.company && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" />{job.company}
                  </span>
                )}
                {job.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPinIcon className="h-4 w-4" />{job.location}
                  </span>
                )}
                {job.job_type && (
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" />{job.job_type}
                  </span>
                )}
                {job.experience_level && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />{job.experience_level}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />{job.applicants} applicant{job.applicants !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  Posted {new Date(job.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {job.description && (
              <Card className="p-6">
                <h2 className="text-base font-semibold mb-3">About the Role</h2>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {job.description}
                </div>
              </Card>
            )}

            {job.requirements && (
              <Card className="p-6">
                <h2 className="text-base font-semibold mb-3">Requirements</h2>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {job.requirements}
                </div>
              </Card>
            )}

            {job.benefits && (
              <Card className="p-6">
                <h2 className="text-base font-semibold mb-3">Benefits</h2>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {job.benefits}
                </div>
              </Card>
            )}

            {job.skills && job.skills.length > 0 && (
              <Card className="p-6">
                <h2 className="text-base font-semibold mb-3">Required Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {job.skills.map(s => (
                    <Badge key={s} variant="secondary">{s}</Badge>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card className="p-5 sticky top-20">
              {salary && (
                <div className="flex items-center gap-2 mb-4 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-700 dark:text-green-400">{salary}</span>
                </div>
              )}

              {applySuccess ? (
                <div className="text-center py-4">
                  <CheckCircle className="mx-auto h-10 w-10 text-green-500 mb-2" />
                  <p className="font-semibold">Application submitted!</p>
                  <p className="text-sm text-muted-foreground mt-1">Good luck with your application.</p>
                </div>
              ) : alreadyApplied ? (
                <div className="text-center py-4">
                  <CheckCircle className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                  <p className="font-semibold">Already applied</p>
                  <p className="text-sm text-muted-foreground mt-1">Your application is under review.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Apply for this position
                  </p>
                  {authUser ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Cover letter (optional)</Label>
                        <Textarea
                          rows={3}
                          value={coverLetter}
                          onChange={e => setCoverLetter(e.target.value)}
                          placeholder="Tell the company why you're a great fit…"
                          className="text-sm"
                        />
                      </div>
                      {applyError && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />{applyError}
                        </p>
                      )}
                      <Button className="w-full" onClick={handleApply} disabled={applying}>
                        {applying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        {applying ? 'Submitting…' : 'Submit Application'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 text-center">
                      <p className="text-sm text-muted-foreground">Sign in to apply for this position</p>
                      <Button className="w-full" onClick={() => router.push('/login')}>
                        Sign in to Apply
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Don&apos;t have an account?{' '}
                        <Link href="/signup" className="text-primary hover:underline">Sign up free</Link>
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground text-center">
                <span className="flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Posted {new Date(job.created_at).toLocaleDateString()}
                </span>
                <span className="flex items-center justify-center gap-1 mt-1">
                  <Users className="h-3 w-3" />
                  {job.applicants} applicant{job.applicants !== 1 ? 's' : ''}
                </span>
              </div>
            </Card>

            <Button variant="outline" className="w-full gap-1.5" asChild>
              <Link href="/jobs"><ArrowLeft className="h-4 w-4" /> Back to Jobs</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
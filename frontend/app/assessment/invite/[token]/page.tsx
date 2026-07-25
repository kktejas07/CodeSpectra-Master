'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Code2, AlertCircle, Loader2, ArrowRight, ShieldCheck } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'

interface AssessmentStepData {
  id: string
  title: string
  target_url: string
  type?: string
  allowed_languages?: string[]
  status?: string
}

export default function CandidateInviteLandingPage() {
  const params = useParams()
  const router = useRouter()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [candidateData, setCandidateData] = useState<{
    email: string
    full_name: string
    target_url: string
    assigned_assessments?: AssessmentStepData[]
    allowed_languages?: string[]
  } | null>(null)

  useEffect(() => {
    if (!token) return
    async function verifyToken() {
      try {
        const res = await csrfFetch(`/api/assessment/invite/${token}`)
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json.error || 'Invalid or expired invitation link.')
        }
        setCandidateData({
          email: json.email,
          full_name: json.full_name,
          target_url: json.target_url || '/assessment',
          assigned_assessments: json.assigned_assessments,
          allowed_languages: json.allowed_languages,
        })
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Verification failed')
      } finally {
        setLoading(false)
      }
    }
    verifyToken()
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Verifying candidate invitation token...
        </div>
      </div>
    )
  }

  if (error || !candidateData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-6 text-center border-destructive/30 space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Invitation Link Invalid</h1>
          <p className="text-sm text-muted-foreground">
            {error || 'This candidate assessment link is invalid, expired, or has already been used.'}
          </p>
          <div className="pt-2">
            <Link href="/auth/login">
              <Button variant="outline" className="w-full">Go to Sign In</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  const steps = candidateData.assigned_assessments && candidateData.assigned_assessments.length > 0
    ? candidateData.assigned_assessments
    : [
        {
          id: 'step-1',
          title: 'Primary Candidate Assessment',
          target_url: candidateData.target_url,
          allowed_languages: candidateData.allowed_languages,
        },
      ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-background via-background to-primary/5 p-4 py-8">
      <Card className="max-w-2xl w-full p-6 sm:p-8 border-primary/20 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <Code2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Candidate Assessment Portal</h1>
              <p className="text-xs text-muted-foreground">CodeSpectra Automated Proctoring & Evaluation Suite</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 font-medium">
            <ShieldCheck className="h-3.5 w-3.5" /> Token Verified
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card/60 p-4 space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-border/40">
            <span className="text-muted-foreground">Candidate Name:</span>
            <span className="font-semibold text-foreground">{candidateData.full_name}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border/40">
            <span className="text-muted-foreground">Candidate Email:</span>
            <span className="font-mono text-foreground">{candidateData.email}</span>
          </div>
          {candidateData.allowed_languages && candidateData.allowed_languages.length > 0 && (
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Allowed Coding Languages:</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 capitalize">
                {candidateData.allowed_languages.join(', ')}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span>Your Assigned Assessment Pipeline</span>
            <span className="text-xs font-normal text-muted-foreground">({steps.length} {steps.length === 1 ? 'stage' : 'stages'})</span>
          </h2>

          <div className="grid gap-3">
            {steps.map((step, idx) => {
              const langs = step.allowed_languages || candidateData.allowed_languages
              return (
                <div
                  key={step.id || idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      <h3 className="font-semibold text-foreground text-sm">{step.title}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground pl-7">
                      <span className="font-mono bg-muted px-2 py-0.5 rounded border border-border">{step.target_url}</span>
                      {langs && langs.length > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                          Languages: {langs.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      const url = `${step.target_url}?inviteEmail=${encodeURIComponent(candidateData.email)}&inviteToken=${token}`
                      router.push(url)
                    }}
                    size="sm"
                    className="gap-1.5 shrink-0 self-end sm:self-center"
                  >
                    Start Stage <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-[11px] text-center text-muted-foreground pt-2">
          🔒 Identity check and anti-cheat session proctoring are automatically active for all pipeline stages.
        </p>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Code2, CheckCircle2, AlertCircle, Loader2, ArrowRight, ShieldCheck } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-background via-background to-primary/5 p-4">
      <Card className="max-w-lg w-full p-8 border-primary/20 space-y-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Code2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Assessment Invitation Verified</h1>
            <p className="text-xs text-muted-foreground">CodeSpectra Secure Proctoring Platform</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/60 p-4 space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-border/40">
            <span className="text-muted-foreground">Candidate Name:</span>
            <span className="font-semibold text-foreground">{candidateData.full_name}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border/40">
            <span className="text-muted-foreground">Email Address:</span>
            <span className="font-mono text-foreground">{candidateData.email}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Assigned Pipeline:</span>
            <span className="font-mono font-bold text-primary">{candidateData.target_url}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>Identity & proctoring check bound to candidate profile ({candidateData.email}).</span>
        </div>

        <Button
          onClick={() => router.push(`${candidateData.target_url}?inviteEmail=${encodeURIComponent(candidateData.email)}`)}
          className="w-full gap-2 shadow-lg"
          size="lg"
        >
          Begin Candidate Assessment <ArrowRight className="h-4 w-4" />
        </Button>
      </Card>
    </div>
  )
}

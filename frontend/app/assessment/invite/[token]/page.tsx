'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Code2, AlertCircle, Loader2, ArrowRight, ShieldCheck, Lock, User } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useAuth } from '@/lib/auth-context'
import { DeviceShowcase, SoftGlow } from '@/components/visuals'

interface AssessmentStepData {
  id: string
  title: string
  target_url: string
  type?: string
  allowed_languages?: string[]
  status?: string
}

export default function CandidateInviteLandingPage() {
  const { user } = useAuth()
  const params = useParams()
  const router = useRouter()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState<string | null>(null)
  const [isExpired, setIsExpired] = useState(false)
  const [isUsed, setIsUsed] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const [renewedMsg, setRenewedMsg] = useState<string | null>(null)
  const [renewedEmail, setRenewedEmail] = useState('')
  const [candidateData, setCandidateData] = useState<{
    email: string
    full_name: string
    target_url: string
    is_registered: boolean
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
          if (json.is_used) setIsUsed(true)
          if (json.is_expired) setIsExpired(true)
          throw new Error(json.error || 'Invalid or expired invitation link.')
        }
        setCandidateData({
          email: json.email,
          full_name: json.full_name,
          target_url: json.target_url || '/assessment',
          is_registered: !!json.is_registered,
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

  const handleRequestNewLink = async () => {
    setRenewing(true)
    setError(null)
    try {
      const res = await csrfFetch(`/api/assessment/invite/${token}/renew`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to request new link')
      setRenewedMsg(json.message || 'A new invitation link has been sent to your email.')
      setRenewedEmail(candidateData?.email || '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to request new link')
    } finally {
      setRenewing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Checking your invitation…
        </div>
      </div>
    )
  }

  if (error || !candidateData) {
    return (
      <div className="relative isolate min-h-screen flex items-center justify-center bg-background p-4">
        <SoftGlow />
        <Card className="max-w-md w-full rounded-3xl p-6 sm:p-8 text-center border-border/70 space-y-4 shadow-sm dark:shadow-none">
          {renewedMsg ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400 mx-auto">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-bold text-foreground">New link requested</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {renewedMsg}
              </p>
              <div className="bg-muted/40 border border-border rounded-2xl p-4 text-left space-y-2">
                <p className="text-sm font-medium">What happens next?</p>
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>Open your email inbox (<span className="font-mono text-foreground">{renewedEmail}</span>)</li>
                  <li>Click the new invitation link from the email</li>
                  <li>Sign in or create your account to start the assessment</li>
                </ol>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <Button className="w-full gap-2" asChild>
                  <a
                  href={`https://mail.google.com/mail/u/0/#inbox`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full"
                >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                    Open Gmail
                  </a>
                </Button>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/auth/login" className="block">Go to sign in</Link>
                </Button>
              </div>
            </>
          ) : isUsed ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Assessment already completed</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This invitation has already been used to complete the assessment. If you need to retake the assessment, please contact your administrator.
              </p>
              <div className="pt-2">
                <Button className="w-full" asChild>
                  <Link href="/auth/login" className="block">Go to sign in</Link>
                </Button>
              </div>
            </>
          ) : isExpired ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Invitation link expired</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This candidate assessment link has expired. Request a fresh link and check your email to start the assessment.
              </p>
              <div className="pt-2 space-y-2">
                <Button 
                  onClick={handleRequestNewLink} 
                  disabled={renewing}
                  className="w-full font-semibold"
                >
                  {renewing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Requesting…</>
                  ) : (
                    'Request a new link'
                  )}
                </Button>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/auth/login" className="block">Go to sign in</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mx-auto">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Invitation link not valid</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {error || 'This candidate assessment link is invalid or has already been used.'}
              </p>
              <div className="pt-2">
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/auth/login">Go to sign in</Link>
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    )
  }

  const steps = candidateData.assigned_assessments && candidateData.assigned_assessments.length > 0
    ? candidateData.assigned_assessments
    : [
        {
          id: 'step-1',
          title: 'Assessment',
          target_url: candidateData.target_url,
          allowed_languages: candidateData.allowed_languages,
        },
      ]

  return (
    <div className="relative isolate min-h-screen flex items-center justify-center gap-12 bg-linear-to-br from-background via-background to-primary/5 p-4 py-8 xl:gap-16">
      <SoftGlow />
      <DeviceShowcase variant="candidate" compact className="mx-0 hidden max-w-[400px] shrink-0 xl:block" />
      <Card className="max-w-2xl w-full rounded-3xl p-6 sm:p-8 border-border/70 space-y-6 shadow-sm dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <Code2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Your assessment</h1>
              <p className="text-xs text-muted-foreground">Check your details, then start each stage when you're ready.</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20 font-medium">
            <ShieldCheck className="h-3.5 w-3.5" /> Invite verified
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="flex justify-between py-1 border-b border-border/40">
            <span className="text-muted-foreground">Name</span>
            <span className="font-semibold text-foreground">{candidateData.full_name}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border/40">
            <span className="text-muted-foreground">Email</span>
            <span className="font-mono text-foreground">{candidateData.email}</span>
          </div>
          {candidateData.allowed_languages && candidateData.allowed_languages.length > 0 && (
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Allowed languages</span>
              <span className="font-semibold text-foreground capitalize">
                {candidateData.allowed_languages.join(', ')}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span>Your assessment stages</span>
            <span className="text-xs font-normal text-muted-foreground">({steps.length} {steps.length === 1 ? 'stage' : 'stages'})</span>
          </h2>

          <div className="grid gap-3">
            {steps.map((step, idx) => {
              const langs = step.allowed_languages || candidateData.allowed_languages
              return (
                <div
                  key={step.id || idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors duration-200"
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
                        <span className="text-muted-foreground">
                          Languages: {langs.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  {candidateData.is_registered ? (
                    user && user.email?.toLowerCase() === candidateData.email.toLowerCase() ? (
                      <Button
                        onClick={async () => {
                          setStarting(step.id || 'start')
                          try {
                            const res = await csrfFetch(`/api/assessment/invite/${token}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ email: candidateData.email }),
                            })
                            const json = await res.json()
                            if (!res.ok) throw new Error(json.error || 'Failed to activate invite')
                            const url = `${step.target_url}?inviteEmail=${encodeURIComponent(candidateData.email)}&inviteToken=${token}`
                            router.push(url)
                          } catch (e: unknown) {
                            const msg = e instanceof Error ? e.message : 'Failed to start'
                            setError(msg)
                            setStarting(null)
                          }
                        }}
                        size="sm"
                        disabled={starting !== null}
                        className="gap-1.5 shrink-0 self-end sm:self-center"
                      >
                        {starting === (step.id || 'start') ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Activating…</>
                        ) : (
                          <><Lock className="h-3.5 w-3.5" /> Start stage <ArrowRight className="h-3.5 w-3.5" /></>
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          const loginUrl = `/auth/login?email=${encodeURIComponent(candidateData.email)}&redirect=${encodeURIComponent(window.location.pathname)}`
                          router.push(loginUrl)
                        }}
                        size="sm"
                        className="gap-1.5 shrink-0 self-end sm:self-center bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
                      >
                        <User className="h-3.5 w-3.5" /> Sign in to start <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    )
                  ) : (
                    <Button
                      onClick={() => {
                        const registerUrl = `/auth/signup?email=${encodeURIComponent(candidateData.email)}&redirect=${encodeURIComponent(window.location.pathname)}`
                        router.push(registerUrl)
                      }}
                      size="sm"
                      className="gap-1.5 shrink-0 self-end sm:self-center font-semibold"
                    >
                      <User className="h-3.5 w-3.5" /> Register to start <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {starting && (
          <p className="text-[11px] text-center text-muted-foreground pt-2">
            <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
            Opening your assessment — please wait…
          </p>
        )}
        <p className="text-[11px] text-center text-muted-foreground pt-2">
          This invite link works once. An identity check and proctoring (webcam and screen monitoring) run during the assessment.
        </p>
      </Card>
    </div>
  )
}

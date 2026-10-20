'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, ExternalLink, ShieldCheck, AlertTriangle, Loader2,
  Info, RefreshCcw, Globe, FileCheck, Eye, Clock, RotateCcw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SkeletonCard, SkeletonButton } from '@/components/ui/skeleton-boneyard'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { PageHeader, Panel } from '@/components/app/page-kit'

// Helper to render warnings (handles both strings and Didit warning objects)
function renderWarning(w: unknown): string {
  if (typeof w === 'string') return w
  if (w && typeof w === 'object') {
    const obj = w as Record<string, unknown>
    return (obj.short_description as string) || (obj.long_description as string) || (obj.feature as string) || JSON.stringify(obj)
  }
  return String(w)
}

interface KycStatus {
  kyc_status: string
  verified: boolean
  provider: string | null
  session_id: string | null
  result: {
    document_type?: string
    full_name?: string
    first_name?: string
    last_name?: string
    date_of_birth?: string
    gender?: string
    age?: number
    document_number?: string
    issuing_state?: string
    nationality?: string
    address?: string
    front_image?: string
    back_image?: string
    portrait_image?: string
    liveness_score?: number
    liveness_method?: string
    liveness_image?: string
    face_match_source?: string
    face_match_target?: string
    face_match_similarity?: number
    vpn_detected?: boolean
    ip_address?: string
    ip_city?: string
    ip_country?: string
    device?: string
    browser?: string
    isp?: string
    warnings?: string[]
  } | null
  created_at: string | null
}

interface SessionResponse {
  url: string
  session_id: string
}

export default function IdentityVerificationPage() {
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const [status, setStatus] = useState<KycStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identityProvider, setIdentityProvider] = useState<'didit' | 'digilocker' | 'off' | null>(null)

  useEffect(() => {
    void fetch('/api/kyc/purposes', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const v = d.identity_kyc
        setIdentityProvider(v === 'digilocker' || v === 'off' || v === 'didit' ? v : 'didit')
      })
      .catch(() => setIdentityProvider('didit'))
    void fetchStatus()

    // Check if we returned from Didit (query param indicates completion)
    const params = new URLSearchParams(window.location.search)
    if (params.get('session_id')) {
      void fetchStatus()
    }
  }, [])

  async function fetchStatus() {
    try {
      const res = await csrfFetch('/api/kyc/didit/status', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as KycStatus
        setStatus(data)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function refreshStatus() {
    setLoading(true)
    await fetchStatus()
  }

  async function startVerification() {
    setStarting(true)
    setError(null)
    try {
      const res = await csrfFetch('/api/kyc/didit/session', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json() as SessionResponse & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to start verification')

      // Redirect to Didit's hosted verification page (most reliable across browsers)
      if (data.url) {
        window.location.href = data.url
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start verification')
      setStarting(false)
    }
  }

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const identityVerifyTour: TourStep[] = [
        {
          target: '[data-tour="identity-verify-header"]',
          title: 'Verify your identity',
          description: 'This page runs one-time KYC for every user to unlock exams and gated features.',
          position: 'bottom',
        },
        {
          target: '[data-tour="identity-verify-start"]',
          title: 'Start verification',
          description: 'This opens the secure Didit verification page. You come back here when it is done.',
          position: 'top',
        },
        {
          target: '[data-tour="identity-verify-features"]',
          title: 'Have your ID ready',
          description: 'Tip: keep a government ID and selfie ready — this panel lists the ID, liveness, face, and fraud checks.',
          position: 'top',
        },
      ]
      autoPlayPageTour('identity-verify', identityVerifyTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready) return null

  // Purpose routing (SuperAdmin → Purpose routing tab)
  if (identityProvider === null || loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted/60 rounded animate-pulse" />
          <div className="h-4 w-72 bg-muted/40 rounded animate-pulse" />
        </div>
        <SkeletonCard />
        <SkeletonCard />
        <div className="space-y-3">
          <div className="h-4 w-32 bg-muted/40 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
        <SkeletonButton />
      </div>
    )
  }

  if (identityProvider === 'off') {
    return (
      <div className="space-y-4 py-16 text-center" data-testid="identity-verify-page">
        <ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-bold text-foreground">Identity verification is off</h1>
        <p className="mx-auto max-w-[60ch] text-sm text-muted-foreground">
          Full identity verification isn&apos;t turned on for this platform right now, so there&apos;s nothing to do here.
          Some exams or your profile may still ask for a quick Aadhaar check.
        </p>
      </div>
    )
  }

  if (identityProvider === 'digilocker') {
    return (
      <div className="space-y-4 py-16 text-center" data-testid="identity-verify-page">
        <ShieldCheck className="mx-auto h-12 w-12 text-primary" aria-hidden />
        <h1 className="text-2xl font-bold text-foreground">DigiLocker verification</h1>
        <p className="mx-auto max-w-[60ch] text-sm text-muted-foreground">
          Verification through DigiLocker isn&apos;t available yet. Please check back later.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    )
  }

  // identityProvider === 'didit'

  // Pending or In Review status
  if (status?.kyc_status && status.kyc_status !== 'none' && !status.verified) {
    const isReview = status.kyc_status === 'manual_review'
    const isPending = status.kyc_status === 'pending'
    return (
      <div className="space-y-6" data-testid="identity-verify-page">
        <div className={`rounded-3xl border p-6 sm:p-8 ${isReview ? 'border-amber-500/30 bg-amber-500/5' : 'border-primary/30 bg-primary/5'}`}>
          <div className="text-center mb-6">
            {isReview ? (
              <Eye className="mx-auto h-12 w-12 text-amber-600 dark:text-amber-400 mb-3" aria-hidden />
            ) : (
              <Clock className="mx-auto h-12 w-12 text-primary mb-3" aria-hidden />
            )}
            <h1 className="text-2xl font-bold text-foreground mb-1">
              {isReview ? 'Under review' : 'Verification pending'}
            </h1>
            <p className="text-muted-foreground">
              {isReview 
                ? 'Your verification is being reviewed by our team. We\'ll notify you once a decision is made.'
                : 'Your verification is being processed. This usually takes a few seconds.'}
            </p>
          </div>

          {/* Verification Details */}
          {status.result && (
            <div className="space-y-4">
              {/* Document Info */}
              <div className="p-4 rounded-2xl bg-background/60 border border-border/60">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <FileCheck className="h-4 w-4" /> Document information
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.full_name && (
                    <div>
                      <p className="text-xs text-muted-foreground">Full name</p>
                      <p className="font-medium text-foreground">{status.result.full_name}</p>
                    </div>
                  )}
                  {status.result.document_type && (
                    <div>
                      <p className="text-xs text-muted-foreground">Document type</p>
                      <p className="font-medium text-foreground">{status.result.document_type}</p>
                    </div>
                  )}
                  {status.result.document_number && (
                    <div>
                      <p className="text-xs text-muted-foreground">Document number</p>
                      <p className="font-medium font-mono text-xs">{status.result.document_number}</p>
                    </div>
                  )}
                  {status.result.date_of_birth && (
                    <div>
                      <p className="text-xs text-muted-foreground">Date of birth</p>
                      <p className="font-medium text-foreground">{status.result.date_of_birth}</p>
                    </div>
                  )}
                  {status.result.gender && (
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="font-medium text-foreground">{status.result.gender}</p>
                    </div>
                  )}
                  {status.result.issuing_state && (
                    <div>
                      <p className="text-xs text-muted-foreground">Issuing country</p>
                      <p className="font-medium text-foreground">{status.result.issuing_state}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Biometric Checks */}
              <div className="p-4 rounded-2xl bg-background/60 border border-border/60">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Biometric verification
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.liveness_score !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Liveness score</p>
                      <p className="font-medium tabular-nums text-foreground">{status.result.liveness_score}/100</p>
                    </div>
                  )}
                  {status.result.liveness_method && (
                    <div>
                      <p className="text-xs text-muted-foreground">Liveness method</p>
                      <p className="font-medium text-foreground">{status.result.liveness_method}</p>
                    </div>
                  )}
                  {status.result.face_match_similarity !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Face match</p>
                      <p className="font-medium tabular-nums text-foreground">{status.result.face_match_similarity}%</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Device & IP Info */}
              <div className="p-4 rounded-2xl bg-background/60 border border-border/60">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Device and location
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.ip_address && (
                    <div>
                      <p className="text-xs text-muted-foreground">IP address</p>
                      <p className="font-medium font-mono text-xs">{status.result.ip_address}</p>
                    </div>
                  )}
                  {status.result.ip_city && (
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="font-medium text-foreground">{status.result.ip_city}, {status.result.ip_country}</p>
                    </div>
                  )}
                  {status.result.device && (
                    <div>
                      <p className="text-xs text-muted-foreground">Device</p>
                      <p className="font-medium text-foreground">{status.result.device}</p>
                    </div>
                  )}
                  {status.result.browser && (
                    <div>
                      <p className="text-xs text-muted-foreground">Browser</p>
                      <p className="font-medium text-foreground">{status.result.browser}</p>
                    </div>
                  )}
                  {status.result.vpn_detected !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">VPN detected</p>
                      <p className="font-medium text-foreground">{status.result.vpn_detected ? 'Yes' : 'No'}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {status.result.warnings && status.result.warnings.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/25">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" /> Warnings
                  </h3>
                  <ul className="list-disc pl-4 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    {status.result.warnings.map((w, i) => (
                      <li key={i}>{renderWarning(w)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}


              {/* Document Images */}
              {(status.result?.front_image || status.result?.back_image || status.result?.portrait_image) && (
                <div className="mt-4 p-4 rounded-2xl bg-background/60 border border-border/60">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <FileCheck className="h-4 w-4" /> Submitted documents
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {status.result?.front_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID front</p>
                        <img src={status.result?.front_image} alt="ID front" className="w-full h-40 object-contain rounded-xl border border-border bg-background" />
                      </div>
                    )}
                    {status.result?.back_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID back</p>
                        <img src={status.result?.back_image} alt="ID back" className="w-full h-40 object-contain rounded-xl border border-border bg-background" />
                      </div>
                    )}
                    {status.result?.portrait_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Portrait</p>
                        <img src={status.result?.portrait_image} alt="Portrait" className="w-full h-40 object-contain rounded-xl border border-border bg-background" />
                      </div>
                    )}
                  </div>
                </div>
              )}

          {status.created_at && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              Submitted on {formatDate(status.created_at, undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          <div className="flex items-center justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={refreshStatus}>
              <RefreshCcw className="h-4 w-4 mr-1" />Refresh status
            </Button>
            <Button size="sm" onClick={startVerification}>
              <RotateCcw className="h-4 w-4 mr-1" />Retake verification
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Already verified
  if (status?.verified) {
    return (
      <div className="space-y-6" data-testid="identity-verify-page">
        <div className="rounded-3xl border border-green-500/30 bg-green-500/5 p-6 sm:p-8">
          <div className="text-center mb-6">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 dark:text-green-400 mb-3" aria-hidden />
            <h1 className="text-2xl font-bold text-foreground mb-1">Identity verified</h1>
            <p className="text-muted-foreground">Your identity has been verified successfully.</p>
          </div>

          {/* Verification Details */}
          {status.result && (
            <div className="space-y-4">
              {/* Document Info */}
              <div className="p-4 rounded-2xl bg-background/60 border border-border/60">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <FileCheck className="h-4 w-4" /> Document information
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.full_name && (
                    <div>
                      <p className="text-xs text-muted-foreground">Full name</p>
                      <p className="font-medium text-foreground">{status.result.full_name}</p>
                    </div>
                  )}
                  {status.result.document_type && (
                    <div>
                      <p className="text-xs text-muted-foreground">Document type</p>
                      <p className="font-medium text-foreground">{status.result.document_type}</p>
                    </div>
                  )}
                  {status.result.document_number && (
                    <div>
                      <p className="text-xs text-muted-foreground">Document number</p>
                      <p className="font-medium font-mono text-xs">{status.result.document_number}</p>
                    </div>
                  )}
                  {status.result.date_of_birth && (
                    <div>
                      <p className="text-xs text-muted-foreground">Date of birth</p>
                      <p className="font-medium text-foreground">{status.result.date_of_birth}</p>
                    </div>
                  )}
                  {status.result.gender && (
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="font-medium text-foreground">{status.result.gender}</p>
                    </div>
                  )}
                  {status.result.issuing_state && (
                    <div>
                      <p className="text-xs text-muted-foreground">Issuing country</p>
                      <p className="font-medium text-foreground">{status.result.issuing_state}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Biometric Checks */}
              <div className="p-4 rounded-2xl bg-background/60 border border-border/60">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Biometric verification
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.liveness_score !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Liveness score</p>
                      <p className="font-medium tabular-nums text-foreground">{status.result.liveness_score}/100</p>
                    </div>
                  )}
                  {status.result.liveness_method && (
                    <div>
                      <p className="text-xs text-muted-foreground">Liveness method</p>
                      <p className="font-medium text-foreground">{status.result.liveness_method}</p>
                    </div>
                  )}
                  {status.result.face_match_similarity !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Face match</p>
                      <p className="font-medium tabular-nums text-foreground">{status.result.face_match_similarity}%</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Device & IP Info */}
              <div className="p-4 rounded-2xl bg-background/60 border border-border/60">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Device and location
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.ip_address && (
                    <div>
                      <p className="text-xs text-muted-foreground">IP address</p>
                      <p className="font-medium font-mono text-xs">{status.result.ip_address}</p>
                    </div>
                  )}
                  {status.result.ip_city && (
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="font-medium text-foreground">{status.result.ip_city}, {status.result.ip_country}</p>
                    </div>
                  )}
                  {status.result.device && (
                    <div>
                      <p className="text-xs text-muted-foreground">Device</p>
                      <p className="font-medium text-foreground">{status.result.device}</p>
                    </div>
                  )}
                  {status.result.browser && (
                    <div>
                      <p className="text-xs text-muted-foreground">Browser</p>
                      <p className="font-medium text-foreground">{status.result.browser}</p>
                    </div>
                  )}
                  {status.result.vpn_detected !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">VPN detected</p>
                      <p className="font-medium text-foreground">{status.result.vpn_detected ? 'Yes' : 'No'}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {status.result.warnings && status.result.warnings.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/25">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" /> Warnings
                  </h3>
                  <ul className="list-disc pl-4 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                    {status.result.warnings.map((w, i) => (
                      <li key={i}>{renderWarning(w)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {status.created_at && (
            <>
              {/* Document Images */}
              {(status.result?.front_image || status.result?.back_image || status.result?.portrait_image) && (
                <div className="mt-4 p-4 rounded-2xl bg-background/60 border border-border/60">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <FileCheck className="h-4 w-4" /> Submitted documents
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {status.result?.front_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID front</p>
                        <img src={status.result?.front_image} alt="ID front" className="w-full h-40 object-contain rounded-xl border border-border bg-background" />
                      </div>
                    )}
                    {status.result?.back_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID back</p>
                        <img src={status.result?.back_image} alt="ID back" className="w-full h-40 object-contain rounded-xl border border-border bg-background" />
                      </div>
                    )}
                    {status.result?.portrait_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Portrait</p>
                        <img src={status.result?.portrait_image} alt="Portrait" className="w-full h-40 object-contain rounded-xl border border-border bg-background" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center mt-4">
                Verified on {formatDate(status.created_at, undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </>
          )}

          <div className="text-center mt-4">
            <Button variant="outline" size="sm" onClick={refreshStatus}>
              <RefreshCcw className="h-4 w-4 mr-1" />Refresh status
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Main verification page
  return (
    <div className="space-y-6" data-testid="identity-verify-page">
      <div data-tour="identity-verify-header">
        <PageHeader
          className="mb-0"
          icon={<ShieldCheck aria-hidden />}
          title="Identity verification"
          description="Verify your identity once to unlock every platform feature, including proctored assessments. It takes about a minute."
        />
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Features */}
      <Panel data-tour="identity-verify-features">
        <h2 className="text-lg font-semibold text-foreground mb-4">What&apos;s included</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <FileCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">ID verification</p>
              <p className="text-xs text-muted-foreground">A photo of your passport, national ID card or driving licence</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Liveness check</p>
              <p className="text-xs text-muted-foreground">A short selfie check that you are a real person, present right now</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Face match</p>
              <p className="text-xs text-muted-foreground">Your selfie is compared with the photo on your ID</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">IP analysis</p>
              <p className="text-xs text-muted-foreground">Your IP address, approximate location and device are recorded, and VPN use is flagged</p>
            </div>
          </div>
        </div>
      </Panel>

      {/* How it works */}
      <Panel>
        <h2 className="text-lg font-semibold text-foreground mb-4">How it works</h2>
        <div className="space-y-3">
          {[
            { step: 1, title: 'Select "Start identity verification"', desc: 'You are taken to our verification partner Didit\'s secure page' },
            { step: 2, title: 'Upload your ID', desc: 'Take a photo of your government-issued ID document' },
            { step: 3, title: 'Take a selfie', desc: 'The system verifies you\'re a real person (passive, no head turns needed)' },
            { step: 4, title: 'Done', desc: 'You return here and see your result. Some checks go to our team for review.' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold tabular-nums text-primary">{item.step}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Privacy note */}
      <div className="rounded-2xl border border-border/70 bg-muted/40 p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">What we collect:</strong> our verification partner Didit processes your ID photos and selfie. We keep the result and the details shown on this page after you finish: your name, date of birth, gender, document type and number, liveness and face-match scores, links to your ID and portrait images, and your IP address, location, device, browser and VPN status. You and our review team can see them. Data is kept according to our privacy policy.
      </div>

      {/* Start button */}
      <Button
        onClick={startVerification}
        disabled={starting}
        size="lg"
        className="w-full sm:w-auto"
        data-testid="start-verification"
        data-tour="identity-verify-start"
      >
        {starting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <ExternalLink className="h-4 w-4 mr-2" />
        )}
        Start identity verification
      </Button>
    </div>
  )
}

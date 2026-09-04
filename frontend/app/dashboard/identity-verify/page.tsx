'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle2, Loader2, ExternalLink, ShieldCheck, AlertTriangle,
  Info, RefreshCcw, Globe, FileCheck, Eye, Clock, RotateCcw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'

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

  if (!gate.ready) return null

  // Purpose routing (SuperAdmin → Purpose routing tab)
  if (identityProvider === null || loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading verification status...</p>
      </div>
    )
  }

  if (identityProvider === 'off') {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center" data-testid="identity-verify-page">
        <ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Identity verification is off</h1>
        <p className="text-sm text-muted-foreground">
          SuperAdmin disabled full KYC for this platform. Exam/profile Aadhaar may still use Anon Aadhaar
          if enabled under Purpose routing.
        </p>
      </div>
    )
  }

  if (identityProvider === 'digilocker') {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center" data-testid="identity-verify-page">
        <ShieldCheck className="mx-auto h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">DigiLocker KYC</h1>
        <p className="text-sm text-muted-foreground">
          DigiLocker is selected for identity verification but the OAuth flow is not wired yet.
          Switch Purpose routing back to Didit, or check back after DigiLocker credentials are connected.
        </p>
        <Badge variant="outline">Coming soon</Badge>
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
        <div className={`rounded-xl border p-8 ${isReview ? 'border-amber-400/40 bg-amber-400/5' : 'border-blue-400/40 bg-blue-400/5'}`}>
          <div className="text-center mb-6">
            {isReview ? (
              <Eye className="h-12 w-12 mx-auto text-amber-400 mb-3" />
            ) : (
              <Clock className="h-12 w-12 mx-auto text-blue-400 mb-3" />
            )}
            <h1 className="text-2xl font-bold text-foreground mb-1">
              {isReview ? 'Under Review' : 'Verification Pending'}
            </h1>
            <p className="text-muted-foreground">
              {isReview 
                ? 'Your verification is being reviewed by our team. We\'ll notify you once a decision is made.'
                : 'Your verification is being processed. This usually takes a few seconds.'}
            </p>
          </div>

          {/* Verification Details */}
          {status.result && (
            <div className="max-w-3xl mx-auto space-y-4">
              {/* Document Info */}
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileCheck className="h-4 w-4" /> Document Information
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.full_name && (
                    <div>
                      <p className="text-xs text-muted-foreground">Full Name</p>
                      <p className="font-medium">{status.result.full_name}</p>
                    </div>
                  )}
                  {status.result.document_type && (
                    <div>
                      <p className="text-xs text-muted-foreground">Document Type</p>
                      <p className="font-medium">{status.result.document_type}</p>
                    </div>
                  )}
                  {status.result.document_number && (
                    <div>
                      <p className="text-xs text-muted-foreground">Document Number</p>
                      <p className="font-medium font-mono text-xs">{status.result.document_number}</p>
                    </div>
                  )}
                  {status.result.date_of_birth && (
                    <div>
                      <p className="text-xs text-muted-foreground">Date of Birth</p>
                      <p className="font-medium">{status.result.date_of_birth}</p>
                    </div>
                  )}
                  {status.result.gender && (
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="font-medium">{status.result.gender}</p>
                    </div>
                  )}
                  {status.result.issuing_state && (
                    <div>
                      <p className="text-xs text-muted-foreground">Issuing Country</p>
                      <p className="font-medium">{status.result.issuing_state}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Biometric Checks */}
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Biometric Verification
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.liveness_score !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Liveness Score</p>
                      <p className="font-medium">{status.result.liveness_score}/100</p>
                    </div>
                  )}
                  {status.result.liveness_method && (
                    <div>
                      <p className="text-xs text-muted-foreground">Liveness Method</p>
                      <p className="font-medium">{status.result.liveness_method}</p>
                    </div>
                  )}
                  {status.result.face_match_similarity !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Face Match</p>
                      <p className="font-medium">{status.result.face_match_similarity}%</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Device & IP Info */}
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Device & Location
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.ip_address && (
                    <div>
                      <p className="text-xs text-muted-foreground">IP Address</p>
                      <p className="font-medium font-mono text-xs">{status.result.ip_address}</p>
                    </div>
                  )}
                  {status.result.ip_city && (
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="font-medium">{status.result.ip_city}, {status.result.ip_country}</p>
                    </div>
                  )}
                  {status.result.device && (
                    <div>
                      <p className="text-xs text-muted-foreground">Device</p>
                      <p className="font-medium">{status.result.device}</p>
                    </div>
                  )}
                  {status.result.browser && (
                    <div>
                      <p className="text-xs text-muted-foreground">Browser</p>
                      <p className="font-medium">{status.result.browser}</p>
                    </div>
                  )}
                  {status.result.vpn_detected !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">VPN Detected</p>
                      <p className="font-medium">{status.result.vpn_detected ? 'Yes' : 'No'}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {status.result.warnings && status.result.warnings.length > 0 && (
                <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-4 w-4" /> Warnings
                  </h3>
                  <ul className="list-disc pl-4 text-xs text-amber-600 space-y-1">
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
                <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <FileCheck className="h-4 w-4" /> Submitted Documents
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {status.result?.front_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID Front</p>
                        <img src={status.result?.front_image} alt="ID Front" className="w-full h-40 object-contain rounded-lg border border-border" />
                      </div>
                    )}
                    {status.result?.back_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID Back</p>
                        <img src={status.result?.back_image} alt="ID Back" className="w-full h-40 object-contain rounded-lg border border-border" />
                      </div>
                    )}
                    {status.result?.portrait_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Portrait</p>
                        <img src={status.result?.portrait_image} alt="Portrait" className="w-full h-40 object-contain rounded-lg border border-border" />
                      </div>
                    )}
                  </div>
                </div>
              )}

          {status.created_at && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              Submitted on {new Date(status.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          <div className="flex items-center justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={refreshStatus}>
              <RefreshCcw className="h-4 w-4 mr-1" />Refresh Status
            </Button>
            <Button size="sm" onClick={startVerification}>
              <RotateCcw className="h-4 w-4 mr-1" />Retake Verification
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
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-8">
          <div className="text-center mb-6">
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-400 mb-3" />
            <h1 className="text-2xl font-bold text-foreground mb-1">Identity Verified</h1>
            <p className="text-muted-foreground">Your identity has been verified successfully.</p>
          </div>

          {/* Verification Details */}
          {status.result && (
            <div className="max-w-3xl mx-auto space-y-4">
              {/* Document Info */}
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileCheck className="h-4 w-4" /> Document Information
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.full_name && (
                    <div>
                      <p className="text-xs text-muted-foreground">Full Name</p>
                      <p className="font-medium">{status.result.full_name}</p>
                    </div>
                  )}
                  {status.result.document_type && (
                    <div>
                      <p className="text-xs text-muted-foreground">Document Type</p>
                      <p className="font-medium">{status.result.document_type}</p>
                    </div>
                  )}
                  {status.result.document_number && (
                    <div>
                      <p className="text-xs text-muted-foreground">Document Number</p>
                      <p className="font-medium font-mono text-xs">{status.result.document_number}</p>
                    </div>
                  )}
                  {status.result.date_of_birth && (
                    <div>
                      <p className="text-xs text-muted-foreground">Date of Birth</p>
                      <p className="font-medium">{status.result.date_of_birth}</p>
                    </div>
                  )}
                  {status.result.gender && (
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="font-medium">{status.result.gender}</p>
                    </div>
                  )}
                  {status.result.issuing_state && (
                    <div>
                      <p className="text-xs text-muted-foreground">Issuing Country</p>
                      <p className="font-medium">{status.result.issuing_state}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Biometric Checks */}
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Biometric Verification
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.liveness_score !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Liveness Score</p>
                      <p className="font-medium">{status.result.liveness_score}/100</p>
                    </div>
                  )}
                  {status.result.liveness_method && (
                    <div>
                      <p className="text-xs text-muted-foreground">Liveness Method</p>
                      <p className="font-medium">{status.result.liveness_method}</p>
                    </div>
                  )}
                  {status.result.face_match_similarity !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Face Match</p>
                      <p className="font-medium">{status.result.face_match_similarity}%</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Device & IP Info */}
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Device & Location
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {status.result.ip_address && (
                    <div>
                      <p className="text-xs text-muted-foreground">IP Address</p>
                      <p className="font-medium font-mono text-xs">{status.result.ip_address}</p>
                    </div>
                  )}
                  {status.result.ip_city && (
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="font-medium">{status.result.ip_city}, {status.result.ip_country}</p>
                    </div>
                  )}
                  {status.result.device && (
                    <div>
                      <p className="text-xs text-muted-foreground">Device</p>
                      <p className="font-medium">{status.result.device}</p>
                    </div>
                  )}
                  {status.result.browser && (
                    <div>
                      <p className="text-xs text-muted-foreground">Browser</p>
                      <p className="font-medium">{status.result.browser}</p>
                    </div>
                  )}
                  {status.result.vpn_detected !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">VPN Detected</p>
                      <p className="font-medium">{status.result.vpn_detected ? 'Yes' : 'No'}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {status.result.warnings && status.result.warnings.length > 0 && (
                <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-4 w-4" /> Warnings
                  </h3>
                  <ul className="list-disc pl-4 text-xs text-amber-600 space-y-1">
                    {status.result.warnings.map((w, i) => (
                      <li key={i}>{renderWarning(w)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {status.created_at && (
            <p className="text-xs text-muted-foreground text-center mt-4">

              {/* Document Images */}
              {(status.result?.front_image || status.result?.back_image || status.result?.portrait_image) && (
                <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <FileCheck className="h-4 w-4" /> Submitted Documents
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {status.result?.front_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID Front</p>
                        <img src={status.result?.front_image} alt="ID Front" className="w-full h-40 object-contain rounded-lg border border-border" />
                      </div>
                    )}
                    {status.result?.back_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ID Back</p>
                        <img src={status.result?.back_image} alt="ID Back" className="w-full h-40 object-contain rounded-lg border border-border" />
                      </div>
                    )}
                    {status.result?.portrait_image && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Portrait</p>
                        <img src={status.result?.portrait_image} alt="Portrait" className="w-full h-40 object-contain rounded-lg border border-border" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              Verified on {new Date(status.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}

          <div className="text-center mt-4">
            <Button variant="outline" size="sm" onClick={refreshStatus}>
              <RefreshCcw className="h-4 w-4 mr-1" />Refresh Status
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Main verification page
  return (
    <div className="space-y-6" data-testid="identity-verify-page">
      <div>
        <h1 className="text-2xl font-bold">Identity Verification</h1>
        <p className="text-sm text-muted-foreground">
          Verify your identity to access all platform features. Full KYC via Didit (chosen in SuperAdmin → KYC → Purpose routing).
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Features */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">What's included</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <FileCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">ID Verification</p>
              <p className="text-xs text-muted-foreground">Verify any government-issued ID from 220+ countries</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Liveness Check</p>
              <p className="text-xs text-muted-foreground">AI-powered passive liveness detection (iBeta certified)</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Face Match</p>
              <p className="text-xs text-muted-foreground">Compare your selfie with ID photo (handles old photos)</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">IP Analysis</p>
              <p className="text-xs text-muted-foreground">Detect VPN, proxy, and Tor usage for fraud prevention</p>
            </div>
          </div>
        </div>
      </Card>

      {/* How it works */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">How it works</h2>
        <div className="space-y-3">
          {[
            { step: 1, title: 'Click "Start Verification"', desc: 'A secure modal opens in your browser' },
            { step: 2, title: 'Upload your ID', desc: 'Take a photo of your government-issued ID document' },
            { step: 3, title: 'Take a selfie', desc: 'The system verifies you\'re a real person (passive, no head turns needed)' },
            { step: 4, title: 'Done!', desc: 'Results are instant — typically under 30 seconds' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary">{item.step}</span>
              </div>
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Privacy note */}
      <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <strong>Privacy:</strong> Your documents are processed securely and encrypted. We don't store raw images — only verification results. Data is retained according to our privacy policy.
      </div>

      {/* Start button */}
      <Button
        onClick={startVerification}
        disabled={starting}
        size="lg"
        className="w-full sm:w-auto"
        data-testid="start-verification"
      >
        {starting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <ExternalLink className="h-4 w-4 mr-2" />
        )}
        Start Identity Verification
      </Button>
    </div>
  )
}

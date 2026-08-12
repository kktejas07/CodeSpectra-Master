'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle2, Loader2, ExternalLink, ShieldCheck, AlertTriangle,
  Info, RefreshCcw, Globe, FileCheck
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { csrfFetch } from '@/lib/csrf-fetch'
import { usePageGuard } from '@/lib/use-page-guard'

interface KycStatus {
  kyc_status: string
  verified: boolean
  provider: string | null
  session_id: string | null
  result: {
    document_type?: string
    full_name?: string
    date_of_birth?: string
    liveness_score?: number
    face_match_similarity?: number
    vpn_detected?: boolean
  } | null
  created_at: string | null
}

interface SessionResponse {
  session_id: string
  session_url: string
}

export default function IdentityVerificationPage() {
  const gate = usePageGuard('user')
  const [status, setStatus] = useState<KycStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchStatus()
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

      // Redirect to Didit's hosted verification page
      if (data.session_url) {
        window.location.href = data.session_url
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start verification')
      setStarting(false)
    }
  }

  if (!gate.ready) return null

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading verification status...</p>
      </div>
    )
  }

  // Already verified
  if (status?.verified) {
    return (
      <div className="space-y-6" data-testid="identity-verify-page">
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-8 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-400 mb-3" />
          <h1 className="text-2xl font-bold text-foreground mb-1">Identity Verified</h1>
          <p className="text-muted-foreground mb-4">
            Your identity has been verified successfully.
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            {status.result?.full_name && (
              <span>Verified as <strong>{status.result.full_name}</strong></span>
            )}
            {status.provider && (
              <Badge variant="outline" className="text-xs">{status.provider}</Badge>
            )}
          </div>
          {status.created_at && (
            <p className="text-xs text-muted-foreground mt-3">
              Verified on {new Date(status.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}
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
          Verify your identity to access all platform features. Powered by Didit — SOC 2, ISO 27001 certified.
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
            { step: 1, title: 'Click "Start Verification"', desc: 'You\'ll be redirected to a secure verification page' },
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

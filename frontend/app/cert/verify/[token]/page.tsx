'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Award, CheckCircle, XCircle } from 'lucide-react'

interface VerifyResponse {
  valid: boolean
  reason?: string
  candidate?: { name: string }
  certification?: { title: string; level: string; source: string }
  score?: number
  issued_at?: string
}

/**
 * /cert/verify/[token]
 *
 * Public certificate verification — no auth. An employer scans a QR
 * containing this URL or pastes the token; the page surfaces the
 * candidate's name, certificate, score and issue date.
 */
export default function CertVerifyPage() {
  const { token } = useParams() as { token: string }
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch(`/api/certifications/verify/${token}`)
      .then(async (res) => {
        const json = (await res.json()) as VerifyResponse
        if (active) setData(json)
      })
      .catch(() => {
        if (active) setData({ valid: false, reason: 'network' })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-muted-foreground" data-testid="cert-verify-loading">
        Verifying…
      </main>
    )
  }

  if (!data?.valid) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6" data-testid="cert-verify-invalid">
        <Card className="max-w-md w-full p-8 text-center border-destructive/40 bg-destructive/5">
          <XCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
          <h1 className="text-xl font-bold mb-2">Certificate not found</h1>
          <p className="text-sm text-muted-foreground">
            This token is invalid or the certificate has been revoked.
          </p>
          <code className="text-[11px] block mt-4 text-muted-foreground break-all">{token}</code>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6" data-testid="cert-verify-valid">
      <Card className="max-w-lg w-full p-10 border-green-500/40 bg-gradient-to-br from-green-500/10 via-background to-primary/5">
        <div className="text-center space-y-4">
          <Award className="w-16 h-16 mx-auto text-green-500" />
          <Badge variant="outline" className="border-green-500/40 text-green-500">
            Verified by CodeSpectra
          </Badge>
          <h1 className="text-3xl font-bold" data-testid="cert-verify-title">
            {data.certification?.title}
          </h1>
          <p className="text-sm text-muted-foreground">Awarded to</p>
          <p className="text-2xl font-semibold" data-testid="cert-verify-name">
            {data.candidate?.name}
          </p>
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-border/40 mt-6 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Score</p>
              <p className="font-bold" data-testid="cert-verify-score">{data.score}%</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Level</p>
              <p className="font-bold">{data.certification?.level}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Issued</p>
              <p className="font-bold">
                {data.issued_at ? new Date(data.issued_at).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground pt-4 inline-flex items-center gap-1 justify-center">
            <CheckCircle className="w-3 h-3 text-green-500" /> Open-source curriculum: {data.certification?.source}
          </p>
        </div>
      </Card>
    </main>
  )
}

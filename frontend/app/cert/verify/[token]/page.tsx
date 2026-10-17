'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Award, XCircle, Printer, Download, Sparkles, LogIn, Code2 } from 'lucide-react'
import {
  CertificateRenderer,
  TEMPLATES,
  type CertificateData,
  type TemplateKey,
} from '@/components/cert/CertificateTemplates'
import { usePageGuard } from '@/lib/use-page-guard'
import { DeviceShowcase, SoftGlow } from '@/components/visuals'

interface VerifyResponse {
  valid: boolean
  reason?: string
  candidate?: { name: string }
  certification?: { title: string; level: string; source: string }
  score?: number
  score_label?: string
  issued_at?: string
  template?: string
}

/**
 * /cert/verify/[token]
 *
 * Public certificate page — no auth required. Renders a print-ready
 * certificate using one of three open-source-only templates. Visitors
 * can switch templates via the picker, download a vector SVG, or trigger
 * the browser's print dialog to save as PDF.
 *
 * Template selection is persisted via `?template=classic|modern|minimal`
 * so the candidate can share a direct link in the style they prefer.
 */
export default function CertVerifyPage() {
  const { token } = useParams() as { token: string }
  const gate = usePageGuard('user')
  const search = useSearchParams()
  const router = useRouter()
  const initialTemplate = (search.get('template') as TemplateKey) || 'classic'

  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [template, setTemplate] = useState<TemplateKey>(
    TEMPLATES.find((t) => t.key === initialTemplate)?.key || 'classic',
  )
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  const verifyUrl = useMemo(
    () => (typeof window !== 'undefined' ? `${window.location.origin}/cert/verify/${token}` : ''),
    [token],
  )

  useEffect(() => {
    let active = true
    fetch(`/api/certifications/verify/${token}`)
      .then(async (res) => {
        const json = (await res.json()) as VerifyResponse
        if (active) {
          setData(json)
          if (json.template) {
            setTemplate(json.template as TemplateKey)
          }
        }
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

  // Generate the QR data URL once the verify URL is known so each template
  // can embed it without depending on a network round-trip.
  useEffect(() => {
    if (!verifyUrl) return
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 220, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''))
  }, [verifyUrl])

  if (!gate.ready) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Verifying…
        </div>
      </main>
    )
  }

  if (!gate.allowed) {
    return (
      <main className="relative isolate min-h-screen flex items-center justify-center gap-12 bg-background p-6 xl:gap-16">
        <SoftGlow />
        <DeviceShowcase variant="certificate" compact className="mx-0 hidden max-w-[420px] lg:block" />
        <Card className="max-w-sm w-full p-8 text-center border-primary/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mx-auto mb-4">
            <Award className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-2">Sign in required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Please sign in to verify certificates.
          </p>
          <div className="flex flex-col gap-2">
            <Button className="w-full gap-2" asChild>
              <Link href={`/auth/login?redirect=${encodeURIComponent(`/cert/verify/${token}`)}`}><LogIn className="h-4 w-4" /> Sign in</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/auth/signup">Create account</Link>
            </Button>
          </div>
        </Card>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-muted-foreground" data-testid="cert-verify-loading">
        Verifying…
      </main>
    )
  }

  if (!data?.valid) {
    return (
      <main className="relative isolate min-h-screen flex items-center justify-center p-6" data-testid="cert-verify-invalid">
        <SoftGlow />
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

  const certData: CertificateData = {
    candidateName: data.candidate?.name || 'Anonymous Candidate',
    certificationTitle: data.certification?.title || 'CodeSpectra Assessment',
    level: data.certification?.level || 'Basic',
    source: data.certification?.source || 'Open-source curriculum',
    score: data.score ?? 0,
    scoreLabel: data.score_label,
    issuedAt: data.issued_at || new Date().toISOString(),
    verifyUrl,
    verifyToken: token,
    qrDataUrl,
  }

  return (
    <main className="relative isolate min-h-screen bg-linear-to-br from-background via-background to-primary/5 py-10 px-4" data-testid="cert-verify-valid">
      <SoftGlow className="print:hidden" />
      {/* Header — hidden in print */}
      <div className="max-w-6xl mx-auto mb-6 print:hidden" data-testid="cert-verify-header">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Award className="w-5 h-5" /></span>
            <div>
              <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 mb-1">
                Verified by CodeSpectra
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight leading-tight text-foreground" data-testid="cert-verify-title">
                {certData.certificationTitle}
              </h1>
              <p className="text-sm text-muted-foreground">
                Awarded to <span className="font-semibold text-foreground" data-testid="cert-verify-name">{certData.candidateName}</span> · score{' '}
                <span className="font-semibold tabular-nums text-foreground" data-testid="cert-verify-score">{certData.score}%</span> · issued{' '}
                {formatDate(certData.issuedAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2"
              data-testid="cert-print-btn"
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4" /> Print / Save as PDF
            </Button>
          </div>
        </div>

        {/* Curriculum Source Info */}
        <div className="flex flex-wrap items-center justify-end" data-testid="cert-template-picker">
          <span className="text-[11px] text-muted-foreground">
            <a href="/open-source" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              100% open-source curricula and libraries
            </a>
            .
          </span>
        </div>
      </div>

      {/* Certificate canvas — this is what prints */}
      <div className="max-w-6xl mx-auto" data-testid="cert-canvas-wrapper">
        <div className="cert-print-area shadow-lg dark:shadow-none rounded-2xl overflow-hidden border border-border/60">
          <CertificateRenderer data={certData} template={template} />
        </div>
        <p className="text-[11px] text-center text-muted-foreground mt-4 print:hidden">
          Verify URL: <code className="text-foreground/80">{verifyUrl}</code>
        </p>
      </div>

      {/* Print stylesheet — only the certificate area on the page when printing */}
      <style jsx global>{`
        .cert-sheet {
          aspect-ratio: 1123 / 794;
          width: 100%;
          min-height: 70vh;
        }
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }
          body {
            background: white !important;
          }
          main {
            background: white !important;
            padding: 0 !important;
          }
          .cert-print-area {
            border-radius: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .cert-sheet {
            width: 100vw;
            height: 100vh;
            min-height: 0;
          }
        }
      `}</style>
    </main>
  )
}

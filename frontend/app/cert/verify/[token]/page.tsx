'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Award, Printer, ShieldAlert } from 'lucide-react'
import {
  CertificateRenderer,
  TEMPLATES,
  type CertificateData,
  type TemplateKey,
} from '@/components/cert/CertificateTemplates'
import { SoftGlow } from '@/components/visuals'
import { Illustration } from '@/components/illustrations/spot'

interface VerifyResponse {
  valid: boolean
  status?: 'valid' | 'revoked'
  reason?: string
  holder?: { name: string }
  certification?: { title: string; level: string; source: string }
  score_band?: string | null
  issued_at?: string | null
  revoked_at?: string | null
  issuer?: string
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
  const search = useSearchParams()
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
        const json = (await res.json().catch(() => ({ valid: false, reason: 'error' }))) as VerifyResponse
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

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-muted-foreground" data-testid="cert-verify-loading">
        Verifying…
      </main>
    )
  }

  if (data?.status === 'revoked') {
    return (
      <main className="relative isolate min-h-screen flex items-center justify-center p-6" data-testid="cert-verify-revoked">
        <SoftGlow />
        <Card className="max-w-md w-full p-8 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive">
              <ShieldAlert className="w-5 h-5" aria-hidden />
            </span>
            <div>
              <Badge variant="outline" className="border-destructive/40 text-destructive mb-1">Revoked</Badge>
              <h1 className="text-xl font-bold leading-tight">This certificate is no longer valid</h1>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Holder</dt><dd className="font-medium">{data.holder?.name}</dd>
            <dt className="text-muted-foreground">Certificate</dt><dd className="font-medium">{data.certification?.title}</dd>
            {data.issued_at && (<><dt className="text-muted-foreground">Issued</dt><dd>{formatDate(data.issued_at)}</dd></>)}
            {data.revoked_at && (<><dt className="text-muted-foreground">Revoked</dt><dd>{formatDate(data.revoked_at)}</dd></>)}
            <dt className="text-muted-foreground">Issuer</dt><dd>{data.issuer || 'CodeSpectra'}</dd>
          </dl>
        </Card>
      </main>
    )
  }

  if (!data?.valid) {
    const rateLimited = data?.reason === 'rate-limited'
    return (
      <main className="relative isolate min-h-screen flex items-center justify-center p-6" data-testid="cert-verify-invalid">
        <SoftGlow />
        <Card className="max-w-md w-full p-8 text-center border-destructive/40 bg-destructive/5">
          <Illustration name="not-found" className="mx-auto mb-4 w-40" />
          <h1 className="text-xl font-bold mb-2">{rateLimited ? 'Too many lookups' : 'Certificate not found'}</h1>
          <p className="text-sm text-muted-foreground">
            {rateLimited
              ? 'Wait a minute, then reload this page to check the certificate.'
              : data?.reason === 'network' || data?.reason === 'error'
                ? 'We could not check this certificate right now. Reload the page to try again.'
                : 'No certificate matches this link. Check that the link was copied in full.'}
          </p>
          <code className="text-[11px] block mt-4 text-muted-foreground break-all">{token}</code>
        </Card>
      </main>
    )
  }

  const certData: CertificateData = {
    candidateName: data.holder?.name || 'Certificate holder',
    certificationTitle: data.certification?.title || 'CodeSpectra certificate',
    level: data.certification?.level || 'Certified',
    source: data.certification?.source || data.issuer || 'CodeSpectra',
    score: 0,
    // Verifiers see a band, never the exact score.
    scoreLabel: data.score_band || 'Completed',
    issuedAt: data.issued_at || '',
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
                Valid · issued by {data.issuer || 'CodeSpectra'}
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight leading-tight text-foreground" data-testid="cert-verify-title">
                {certData.certificationTitle}
              </h1>
              <p className="text-sm text-muted-foreground">
                Awarded to <span className="font-semibold text-foreground" data-testid="cert-verify-name">{certData.candidateName}</span>
                {data.score_band ? (
                  <> · <span className="font-semibold text-foreground" data-testid="cert-verify-score">{data.score_band}</span></>
                ) : null}
                {data.issued_at ? <> · issued {formatDate(data.issued_at)}</> : null}
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

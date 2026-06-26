'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Award, XCircle, Printer, Download, Sparkles } from 'lucide-react'
import {
  CertificateRenderer,
  TEMPLATES,
  type CertificateData,
  type TemplateKey,
} from '@/components/cert/CertificateTemplates'

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

  // Generate the QR data URL once the verify URL is known so each template
  // can embed it without depending on a network round-trip.
  useEffect(() => {
    if (!verifyUrl) return
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 220, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''))
  }, [verifyUrl])

  const updateTemplate = (next: TemplateKey) => {
    setTemplate(next)
    const url = new URL(window.location.href)
    url.searchParams.set('template', next)
    router.replace(url.pathname + url.search)
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

  const certData: CertificateData = {
    candidateName: data.candidate?.name || 'Anonymous Candidate',
    certificationTitle: data.certification?.title || 'CodeSpectra Assessment',
    level: data.certification?.level || 'Basic',
    source: data.certification?.source || 'Open-source curriculum',
    score: data.score ?? 0,
    issuedAt: data.issued_at || new Date().toISOString(),
    verifyUrl,
    verifyToken: token,
    qrDataUrl,
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 py-10 px-4" data-testid="cert-verify-valid">
      {/* Header — hidden in print */}
      <div className="max-w-6xl mx-auto mb-6 print:hidden" data-testid="cert-verify-header">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Award className="w-7 h-7 text-emerald-500" />
            <div>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 mb-1">
                Verified by CodeSpectra
              </Badge>
              <h1 className="text-2xl font-bold leading-tight" data-testid="cert-verify-title">
                {certData.certificationTitle}
              </h1>
              <p className="text-sm text-muted-foreground">
                Awarded to <span className="font-semibold text-foreground" data-testid="cert-verify-name">{certData.candidateName}</span> · score{' '}
                <span className="font-semibold text-foreground" data-testid="cert-verify-score">{certData.score}%</span> · issued{' '}
                {new Date(certData.issuedAt).toLocaleDateString()}
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
            <a
              href={`/api/certifications/cert-svg/${token}?template=${template}`}
              download
              data-testid="cert-svg-download"
            >
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" /> Download SVG
              </Button>
            </a>
          </div>
        </div>

        {/* Template picker */}
        <div className="flex flex-wrap items-center gap-2" data-testid="cert-template-picker">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mr-2">Template:</span>
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => updateTemplate(t.key)}
              data-testid={`cert-template-${t.key}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                template === t.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
              title={t.description}
            >
              {t.label}
            </button>
          ))}
          <span className="text-[11px] text-muted-foreground ml-auto hidden sm:inline">
            <a href="/open-source" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              100% open-source curricula and libraries
            </a>
            .
          </span>
        </div>
      </div>

      {/* Certificate canvas — this is what prints */}
      <div className="max-w-6xl mx-auto" data-testid="cert-canvas-wrapper">
        <div className="cert-print-area shadow-2xl rounded-lg overflow-hidden border border-border/40">
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

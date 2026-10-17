'use client'
import { formatDate } from '@/lib/format-datetime'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Award, Download, Share2, ShieldCheck } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { BrandLogo } from '@/app/public-layout'
import { DeviceShowcase, SoftGlow } from '@/components/visuals'
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

function formatIssueDate(iso: string): string {
  if (!iso) return 'Unknown date'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return formatDate(d, undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CertificatePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<VerifyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const addToast = useToast()

  // Public verify page for this certificate (same token the API verifies).
  const verifyUrl = useMemo(
    () => (typeof window !== 'undefined' ? `${window.location.origin}/cert/verify/${encodeURIComponent(id)}` : ''),
    [id],
  )

  useEffect(() => {
    if (!verifyUrl) return
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 160, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [verifyUrl])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl)
      addToast({ type: 'success', title: 'Verification link copied' })
    } catch {
      addToast({ type: 'error', title: 'Could not copy the link', message: verifyUrl })
    }
  }

  const share = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `${recipientName} earned a certificate`, url: verifyUrl })
        return
      } catch (e) {
        // User closed the share sheet — nothing to do.
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    await copyLink()
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`/api/certifications/verify/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({ valid: false, reason: 'error' }))) as VerifyResponse
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
  }, [id])

  const recipientName = data?.holder?.name || 'Certificate holder'
  const courseName = data?.certification?.title || 'CodeSpectra Assessment'
  const source = data?.certification?.source || 'CodeSpectra'
  const issueDate = formatIssueDate(data?.issued_at || '')

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Top Navbar */}
      <header className="print:hidden sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" aria-label="CodeSpectra home" className="text-foreground">
            <BrandLogo className="[&>span:last-child]:text-lg" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="rounded-full">
              <Link href={`/auth/login?redirect=${encodeURIComponent(`/certificate-preview/${id}`)}`}>Log in</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative isolate flex-1 flex flex-col items-center py-12 px-4">
        <SoftGlow className="print:hidden" />

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-20">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Verifying certificate…
          </div>
        ) : !data?.valid ? (
          <Card className="max-w-md w-full rounded-3xl p-8 text-center border-destructive/40 bg-destructive/5">
            <Illustration name="not-found" className="mx-auto mb-4 w-40" />
            <h1 className="text-xl font-bold mb-2">
              {data?.status === 'revoked' ? 'This certificate was revoked' : data?.reason === 'rate-limited' ? 'Too many lookups' : 'Certificate not found'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {data?.status === 'revoked'
                ? `${recipientName}'s certificate "${courseName}" is no longer valid.`
                : data?.reason === 'rate-limited'
                  ? 'Wait a minute, then reload this page.'
                  : 'No certificate matches this link. Check that it was copied in full.'}
            </p>
            {data?.status === 'revoked' && data.revoked_at && (
              <p className="mt-2 text-sm font-medium text-destructive">Revoked on {formatIssueDate(data.revoked_at)}</p>
            )}
            <code className="text-[11px] block mt-4 text-muted-foreground break-all">{id}</code>
          </Card>
        ) : (
        <>
        {/* Certificate Header Info */}
        <div className="print:hidden w-full max-w-4xl mb-8 text-center md:text-left md:flex justify-between items-end">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight flex items-center justify-center md:justify-start gap-3">
              {recipientName} earned a certificate
            </h1>
            <p className="mt-2 text-muted-foreground font-medium">
              This certificate is verified by CodeSpectra. Share it with your network.
            </p>

            <div className="mt-6 flex items-center gap-4 justify-center md:justify-start text-sm">
               <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                 <Award className="h-6 w-6" />
               </div>
               <div>
                 <p className="font-bold text-foreground">{courseName}</p>
                 <p className="text-muted-foreground text-xs">
                   Issued {issueDate} by {data.issuer || 'CodeSpectra'}{data.score_band ? ` · ${data.score_band}` : ''}
                 </p>
               </div>
            </div>
          </div>

          <div className="mt-6 md:mt-0 flex items-center gap-3 justify-center print:hidden">
            <Button variant="outline" className="gap-2 shadow-sm rounded-full" onClick={() => window.print()}>
              <Download className="h-4 w-4" /> Download PDF
            </Button>
            <Button className="gap-2 shadow-sm rounded-full" onClick={share}>
              <Share2 className="h-4 w-4" /> Share
            </Button>
          </div>
        </div>

        {/* The Certificate Itself */}
        <div className="w-full max-w-4xl relative group">
          <div className="print:hidden absolute -inset-1 bg-linear-to-r from-[#2F5BE7] to-[#6E8CF5] rounded-[22px] blur opacity-20 group-hover:opacity-30 transition-opacity duration-300 motion-reduce:transition-none" />

          <Card className="relative bg-white text-slate-900 overflow-hidden border-2 border-[#2F5BE7] rounded-[20px] shadow-2xl p-0 aspect-[1.414/1] max-h-[800px] flex flex-col justify-center items-center text-center">

            {/* Geometric background elements (matching reference) */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
               {/* Simplified SVG poly shapes */}
               <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-1/3 h-1/2 text-[#2F5BE7] fill-current">
                 <polygon points="0,100 0,50 30,80 50,100" />
                 <polygon points="0,50 40,40 30,80" fill="currentColor" opacity="0.6" />
                 <polygon points="40,40 70,100 50,100 30,80" fill="currentColor" opacity="0.3" />
               </svg>
               <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute top-1/4 right-0 w-1/4 h-2/3 text-[#2F5BE7] fill-current">
                 <polygon points="100,0 100,100 60,60" />
                 <polygon points="100,100 60,60 70,80" fill="currentColor" opacity="0.5" />
                 <polygon points="100,0 60,60 80,20" fill="currentColor" opacity="0.3" />
               </svg>
            </div>

            <div className="absolute top-8 left-8 flex items-center gap-2">
               <div className="h-8 w-8 rounded-lg bg-[#2F5BE7] flex items-center justify-center text-white">
                 <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                   <path d="M8 7L3 12L8 17" />
                   <path d="M16 7L21 12L16 17" />
                   <path d="M14 4.5L10 19.5" />
                 </svg>
               </div>
               <span className="font-bold text-xl text-slate-800 tracking-tight">CodeSpectra</span>
            </div>

            <div className="absolute top-8 right-8">
               <div className="h-16 w-16 rounded-full bg-[#2F5BE7]/10 text-[#2F5BE7] flex items-center justify-center border-2 border-dashed border-[#2F5BE7]/40">
                 <Award className="h-8 w-8" />
               </div>
            </div>

            <div className="relative z-10 max-w-2xl px-12 mt-10">
              <h2 className="text-3xl md:text-5xl font-black text-[#1A2E6E] mb-12 uppercase tracking-wide">
                Certificate of Excellence
              </h2>

              <p className="text-xs md:text-sm text-slate-500 font-semibold mb-2 uppercase tracking-widest">
                This is to certify that
              </p>

              <h3 className="text-2xl md:text-4xl font-bold text-[#1E3FB8] mb-8 border-b-2 border-slate-200 pb-2 inline-block px-8">
                {recipientName}
              </h3>

              <p className="text-sm md:text-base text-slate-700 leading-relaxed font-medium max-w-lg mx-auto">
                has successfully earned <span className="text-[#2F5BE7] font-semibold">{courseName}</span> via <span className="text-[#2F5BE7] font-semibold">{source}</span>.
              </p>
            </div>

            {qrDataUrl && (
              <div className="absolute bottom-8 right-8 bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR code linking to this certificate's verification page" width={64} height={64} className="h-16 w-16" />
              </div>
            )}

            <div className="absolute bottom-8 left-8 flex flex-col items-start gap-1">
              <div className="flex items-center gap-1.5 text-slate-500">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Verifiable credential</span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono">ID: {id}</span>
            </div>

          </Card>
        </div>

        {/* Verification link (also what the QR code encodes) */}
        <div className="print:hidden mt-6 w-full max-w-4xl flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">Verify at</span>
          <a href={verifyUrl} className="text-primary underline-offset-4 hover:underline break-all font-mono text-xs">{verifyUrl}</a>
          <Button variant="outline" size="sm" className="sm:ml-auto rounded-full" onClick={copyLink}>Copy link</Button>
        </div>

        {/* Earn-your-own prompt for visitors who opened a shared link */}
        <section className="print:hidden mt-16 w-full max-w-4xl grid items-center gap-8 rounded-3xl border border-border bg-card/70 p-6 sm:p-10 md:grid-cols-[1fr_minmax(0,320px)]">
          <div>
            <p className="text-sm font-semibold text-primary">CodeSpectra certificates</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Earn a verified certificate of your own</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Take a proctored assessment, and the certificate you earn comes with a link and QR code anyone can check.
            </p>
            <Button asChild className="mt-6 rounded-full px-6">
              <Link href="/auth/signup">Create a free account</Link>
            </Button>
          </div>
          <DeviceShowcase variant="certificate" compact className="hidden max-w-[320px] md:block" />
        </section>
        </>
        )}
      </main>
    </div>
  )
}

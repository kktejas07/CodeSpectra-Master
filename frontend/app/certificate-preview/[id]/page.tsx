'use client'
import { formatDate } from '@/lib/format-datetime'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Award, Code2, Download, Share2, ShieldCheck, Search, XCircle } from 'lucide-react'

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

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`/api/certifications/verify/${encodeURIComponent(id)}`, { cache: 'no-store' })
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
  }, [id])

  const recipientName = data?.candidate?.name || 'Anonymous Candidate'
  const courseName = data?.certification?.title || 'CodeSpectra Assessment'
  const source = data?.certification?.source || 'CodeSpectra'
  const issueDate = formatIssueDate(data?.issued_at || '')

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg text-foreground">
            <Code2 className="h-6 w-6 text-primary" />
            <span>CodeSpectra</span>
          </div>
          <div className="hidden md:flex flex-1 max-w-md mx-8">
             <div className="relative w-full">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
               <input
                 type="search"
                 placeholder="Search opportunities…"
                 aria-label="Search opportunities"
                 className="w-full rounded-full border border-border bg-muted/40 px-9 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
               />
             </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden sm:flex rounded-full px-4 text-primary border-primary/30 bg-primary/5 hover:bg-primary/10">
              For business
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center py-12 px-4">

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-20">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Verifying certificate…
          </div>
        ) : !data?.valid ? (
          <Card className="max-w-md w-full rounded-3xl p-8 text-center border-destructive/40 bg-destructive/5">
            <XCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
            <h1 className="text-xl font-bold mb-2">Certificate not found</h1>
            <p className="text-sm text-muted-foreground">
              This certificate id is invalid or the certificate has been revoked.
            </p>
            <code className="text-[11px] block mt-4 text-muted-foreground break-all">{id}</code>
          </Card>
        ) : (
        <>
        {/* Certificate Header Info */}
        <div className="w-full max-w-4xl mb-8 text-center md:text-left md:flex justify-between items-end">
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
                 <p className="text-muted-foreground text-xs">Issued {issueDate}</p>
               </div>
            </div>
          </div>

          <div className="mt-6 md:mt-0 flex items-center gap-3 justify-center">
            <Button variant="outline" className="gap-2 shadow-sm rounded-full">
              <Download className="h-4 w-4" /> Download
            </Button>
            <Button className="gap-2 shadow-sm rounded-full">
              <Share2 className="h-4 w-4" /> Share
            </Button>
          </div>
        </div>

        {/* The Certificate Itself */}
        <div className="w-full max-w-4xl relative group">
          <div className="absolute -inset-1 bg-linear-to-r from-[#2F5BE7] to-[#6E8CF5] rounded-[22px] blur opacity-20 group-hover:opacity-30 transition-opacity duration-300 motion-reduce:transition-none" />

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
               <div className="h-8 w-8 rounded-full bg-[#2F5BE7] flex items-center justify-center text-white font-bold italic">CS</div>
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

            <div className="absolute bottom-8 right-8 bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
               {/* Fake QR Code */}
               <svg width="64" height="64" viewBox="0 0 100 100" fill="currentColor" className="text-slate-800">
                 <rect x="10" y="10" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="10"/>
                 <rect x="60" y="10" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="10"/>
                 <rect x="10" y="60" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="10"/>
                 <rect x="20" y="20" width="10" height="10"/>
                 <rect x="70" y="20" width="10" height="10"/>
                 <rect x="20" y="70" width="10" height="10"/>
                 <path d="M50 50 h40 v40 h-40 z" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5"/>
                 <rect x="60" y="60" width="10" height="10"/>
                 <rect x="80" y="80" width="10" height="10"/>
                 <rect x="50" y="20" width="5" height="5"/>
                 <rect x="20" y="50" width="5" height="5"/>
                 <rect x="40" y="80" width="5" height="5"/>
               </svg>
            </div>

            <div className="absolute bottom-8 left-8 flex flex-col items-start gap-1">
              <div className="flex items-center gap-1.5 text-slate-500">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Verifiable Credential</span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono">ID: {id}</span>
            </div>

          </Card>
        </div>
        </>
        )}
      </main>
    </div>
  )
}

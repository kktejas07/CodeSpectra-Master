'use client'
import { formatDate as tzFormatDate } from '@/lib/format-datetime'

import { useState, useEffect, useRef } from 'react'

interface DigitalIdCardProps {
  name: string
  email: string
  role: string
  id: string
  issuedAt?: string
  expiresAt?: string
  kycVerified?: boolean
}

function formatDate(iso?: string): string {
  if (iso) {
    const d = new Date(iso)
    if (!isNaN(d.getTime())) return tzFormatDate(d, undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return tzFormatDate(new Date(), undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function DigitalIdCard({ name, email, role, id, issuedAt, expiresAt, kycVerified }: DigitalIdCardProps) {
  const [flipped, setFlipped] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'CS'
  // No id yet: show a placeholder rather than a random, fake ID number.
  const idNumber = id ? `CS-${id.slice(0, 8).toUpperCase()}` : "CS-—"
  const now = formatDate(issuedAt)
  const exp = expiresAt ? formatDate(expiresAt) : formatDate(new Date(Date.now() + 365 * 86400000).toISOString())

  const qrPayload = typeof window !== 'undefined' 
    ? `${window.location.origin}/verify/${idNumber}` 
    : `https://codespectra.ai/verify/${idNumber}`

  useEffect(() => {
    let cancelled = false
    import('qrcode').then((QRCode) => {
      if (cancelled) return
      QRCode.toDataURL(qrPayload, { width: 200, margin: 2, color: { dark: '#0B1A4A', light: '#ffffff' } })
        .then((url: string) => { if (!cancelled) setQrDataUrl(url) })
        .catch(() => {})
    }).catch(() => {})
    return () => { cancelled = true }
  }, [qrPayload])

  const roleBadge = role === 'superadmin' ? 'Superadmin' : role === 'tenant_admin' ? 'Admin' : 'Member'

  const handleCopyId = () => {
    navigator.clipboard.writeText(idNumber).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const handleShare = () => {
    const url = window.location.origin + '/dashboard/profile'
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const handleDownload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 540
    canvas.height = 340
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const grad = ctx.createLinearGradient(0, 0, 540, 340)
    grad.addColorStop(0, '#4A72F0')
    grad.addColorStop(0.5, '#2F5BE7')
    grad.addColorStop(1, '#1A2F8F')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 540, 340)

    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    roundRect(ctx, 16, 16, 508, 308, 18)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px system-ui'
    ctx.fillText('CodeSpectra', 32, 48)
    ctx.font = 'bold 22px system-ui'
    ctx.fillText('Official ID', 32, 76)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15px system-ui'
    ctx.fillText(name, 32, 130)
    ctx.font = '12px system-ui'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillText(role, 32, 150)

    ctx.font = 'bold 10px system-ui'
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillText('ID', 32, 178)
    ctx.font = 'bold 13px system-ui'
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillText(idNumber, 32, 194)

    ctx.font = 'bold 10px system-ui'
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillText('Email', 32, 220)
    ctx.font = '12px system-ui'
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillText(email, 32, 236)

    ctx.font = 'bold 10px system-ui'
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillText('Issued', 32, 264)
    ctx.font = '11px system-ui'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(now, 32, 280)

    const link = document.createElement('a')
    link.download = `codespectra-id-${(name || '').replace(/\s+/g, '-').toLowerCase()}.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  return (
    <div className="space-y-6">
      <div
        className="mx-auto w-full max-w-135 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped(!flipped)}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={flipped ? 'Show front of ID card' : 'Show back of ID card'}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped(!flipped) } }}
      >
        <div
          className="relative h-85 w-full transition-transform duration-600 motion-reduce:duration-0"
          style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front face */}
          <div
            className="absolute inset-0 rounded-2xl bg-linear-to-br from-[#4A72F0] via-[#2F5BE7] to-[#1A2F8F] p-px"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="flex h-full flex-col rounded-2xl bg-white/12 p-5 backdrop-blur-sm" style={{ border: '1px solid rgba(255,255,255,0.2)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white/80">CodeSpectra</p>
                  <p className="text-2xl font-bold text-white">Official ID</p>
                </div>
                <div className="rounded-lg border border-white/30 bg-white/15 px-3 py-1">
                  <span className="text-xs font-bold text-white">{roleBadge}</span>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-black/15">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2"><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m14.305 16.53.923-.382"/><path d="m15.228 13.852-.923-.383"/><path d="m16.852 12.228-.383-.923"/><path d="m16.852 17.772-.383.924"/><path d="m19.148 12.228.383-.923"/><path d="m19.53 18.696-.382-.924"/><path d="m20.772 13.852.924-.383"/><path d="m20.772 16.148.924.383"/><circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/></svg>
                </div>
                <div className="flex-1">
                  <p className="text-lg font-bold text-white">{name}</p>
                  <p className="text-sm text-white/85">{role === 'superadmin' ? 'Superadmin · Full access' : role === 'tenant_admin' ? 'Platform admin · Full access' : 'User · Limited access'}</p>
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                <div>
                  <p className="text-xs font-medium text-white/75">ID</p>
                  <p className="font-bold text-white">{idNumber}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-white/75">Email</p>
                  <p className="text-sm font-bold text-white/95">{email}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-white/75">Issued</p>
                  <p className="text-xs font-bold text-white/90">{now}</p>
                </div>
              </div>

              <div className="flex-1" />
              <div className="flex items-center justify-end">
                <p className="text-xs font-medium text-white/80">Tap for verification →</p>
              </div>
            </div>
          </div>

          {/* Back face */}
          <div
            className="absolute inset-0 rounded-2xl bg-linear-to-br from-[#4A72F0] via-[#2F5BE7] to-[#1A2F8F] p-px"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="flex h-full flex-col rounded-2xl bg-white/12 p-5 backdrop-blur-sm" style={{ border: '1px solid rgba(255,255,255,0.2)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white/80">CodeSpectra</p>
                  <p className="text-2xl font-bold text-white">{kycVerified ? 'Verified credential' : 'Digital credential'}</p>
                </div>
                <div className={`rounded-lg border px-3 py-1 ${kycVerified ? 'border-green-300/50 bg-green-500/30' : 'border-white/30 bg-white/15'}`}>
                  <span className="text-xs font-bold text-white">{kycVerified ? 'Verified' : 'Not verified'}</span>
                </div>
              </div>

              <div className="mt-4 flex items-start justify-between gap-4">
                <div className="space-y-2.5 flex-1">
                  <div>
                    <p className="text-xs font-medium text-white/75">Email</p>
                    <p className="text-sm font-bold text-white/95">{email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white/75">Role</p>
                    <p className="text-sm font-bold text-white/95">{roleBadge}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white/75">Access level</p>
                    <p className="text-sm font-bold text-white/95">{role === 'superadmin' || role === 'tenant_admin' ? 'Full access' : 'Standard'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white/75">Expires</p>
                    <p className="text-xs font-bold text-white/90">{exp}</p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 shrink-0">
                  {qrDataUrl ? (
                    <div className="h-25 w-25 rounded-lg bg-white p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrDataUrl} alt="QR code linking to this ID's verification page" className="h-full w-full" />
                    </div>
                  ) : (
                    <div className="flex h-25 w-25 items-center justify-center rounded-lg bg-white p-1">
                      <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-blue-50 to-blue-100 text-center text-[10px] font-bold text-[#1A2F8F]">
                        {initials}
                      </div>
                    </div>
                  )}
                  <div className="flex h-6 w-8 items-center justify-center rounded border border-white/25 bg-white/15">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                </div>
              </div>

              <div className="flex-1" />
              <div className="flex items-center justify-end">
                <p className="text-xs font-medium text-white/80">Tap to flip back →</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={(e) => { e.stopPropagation(); handleCopyId() }} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          {copied ? 'Copied' : 'Copy ID'}
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); handleShare() }} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share profile
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); handleDownload() }} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>
          Download card
        </button>
      </div>

      {/* Info badges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>, title: 'Verified identity', desc: kycVerified ? 'Identity checked via KYC.' : 'Complete KYC to verify.' },
          { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 12h4"/><path d="M10 8h4"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/></svg>, title: 'Platform-wide', desc: 'Recognised across CodeSpectra.' },
          { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/></svg>, title: 'Instant share', desc: 'QR works at events.' },
          { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, title: 'Secure access', desc: 'Links to a verification page.' },
        ].map((b) => (
          <div key={b.title} className="rounded-2xl border border-border/70 bg-card p-3">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              {b.icon}
            </div>
            <p className="text-xs font-semibold text-foreground">{b.title}</p>
            <p className="text-[11px] text-muted-foreground">{b.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

'use client'

import { useState, useEffect, useRef } from 'react'

interface DigitalIdCardProps {
  name: string
  email: string
  role: string
  id: string
  issuedAt?: string
  expiresAt?: string
}

function formatDate(iso?: string): string {
  if (iso) {
    const d = new Date(iso)
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function DigitalIdCard({ name, email, role, id, issuedAt, expiresAt }: DigitalIdCardProps) {
  const [flipped, setFlipped] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')

  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'CS'
  const idNumber = id ? `CS-${id.slice(0, 8).toUpperCase()}` : `CS-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
  const now = formatDate(issuedAt)
  const exp = expiresAt ? formatDate(expiresAt) : formatDate(new Date(Date.now() + 365 * 86400000).toISOString())

  const qrPayload = JSON.stringify({
    name,
    email,
    role,
    id: idNumber,
    issued: now,
    platform: 'CodeSpectra',
  })

  useEffect(() => {
    let cancelled = false
    import('qrcode').then((QRCode) => {
      if (cancelled) return
      QRCode.toDataURL(qrPayload, { width: 200, margin: 2, color: { dark: '#022c22', light: '#ffffff' } })
        .then((url: string) => { if (!cancelled) setQrDataUrl(url) })
        .catch(() => {})
    }).catch(() => {})
    return () => { cancelled = true }
  }, [qrPayload])

  const roleBadge = role === 'superadmin' ? 'SUPERADMIN' : role === 'tenant_admin' ? 'ADMIN' : 'MEMBER'

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
    canvas.height = 440
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const grad = ctx.createLinearGradient(0, 0, 540, 440)
    grad.addColorStop(0, '#34d399')
    grad.addColorStop(0.5, '#10b981')
    grad.addColorStop(1, '#065f46')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 540, 440)

    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    roundRect(ctx, 20, 20, 500, 400, 22)
    ctx.fill()

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 14px system-ui'
    ctx.fillText('CODESPECTRA', 40, 60)
    ctx.font = 'bold 28px system-ui'
    ctx.fillText('OFFICIAL ID', 40, 92)

    ctx.fillStyle = '#022c22'
    ctx.font = 'bold 18px system-ui'
    ctx.fillText(name, 40, 160)
    ctx.font = '14px system-ui'
    ctx.fillStyle = '#022c2299'
    ctx.fillText(role, 40, 182)

    ctx.font = 'bold 11px system-ui'
    ctx.fillStyle = '#022c2280'
    ctx.fillText('ID', 40, 220)
    ctx.font = 'bold 14px system-ui'
    ctx.fillStyle = '#022c22cc'
    ctx.fillText(idNumber, 40, 238)

    ctx.font = 'bold 11px system-ui'
    ctx.fillStyle = '#022c2280'
    ctx.fillText('EMAIL', 40, 268)
    ctx.font = '13px system-ui'
    ctx.fillStyle = '#022c22cc'
    ctx.fillText(email, 40, 286)

    ctx.font = 'bold 11px system-ui'
    ctx.fillStyle = '#022c2280'
    ctx.fillText('ISSUED', 40, 316)
    ctx.font = '12px system-ui'
    ctx.fillStyle = '#022c22b3'
    ctx.fillText(now, 40, 334)

    const link = document.createElement('a')
    link.download = `codespectra-id-${(name || '').replace(/\s+/g, '-').toLowerCase()}.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  return (
    <div className="space-y-6">
      <div
        className="mx-auto w-full max-w-[540px] cursor-pointer"
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped(!flipped)}
      >
        <div
          className="relative h-[440px] w-full transition-transform duration-[600ms]"
          style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front face */}
          <div
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-800 p-[1px]"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="flex h-full flex-col rounded-2xl bg-white/12 p-5 backdrop-blur-sm" style={{ border: '1px solid rgba(255,255,255,0.2)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">CodeSpectra</p>
                  <p className="text-2xl font-bold text-white">OFFICIAL ID</p>
                </div>
                <div className="rounded-lg border border-white/30 bg-white/15 px-3 py-1">
                  <span className="text-xs font-bold text-white">{roleBadge}</span>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-black/15">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(2,44,34,0.5)" strokeWidth="2"><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m14.305 16.53.923-.382"/><path d="m15.228 13.852-.923-.383"/><path d="m16.852 12.228-.383-.923"/><path d="m16.852 17.772-.383.924"/><path d="m19.148 12.228.383-.923"/><path d="m19.53 18.696-.382-.924"/><path d="m20.772 13.852.924-.383"/><path d="m20.772 16.148.924.383"/><circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/></svg>
                </div>
                <div className="flex-1">
                  <p className="text-lg font-bold text-[#022c22]">{name}</p>
                  <p className="text-sm text-[#022c22]/70">{role === 'superadmin' ? 'Super Admin · Full Access' : role === 'tenant_admin' ? 'Platform Admin · Full Access' : 'User · Limited Access'}</p>
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#022c22]/50">ID</p>
                  <p className="font-bold text-[#022c22]">{idNumber}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#022c22]/50">EMAIL</p>
                  <p className="text-sm font-bold text-[#022c22]/80">{email}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#022c22]/50">ISSUED</p>
                  <p className="text-xs font-bold text-[#022c22]/75">{now}</p>
                </div>
              </div>

              <div className="flex-1" />
              <div className="flex items-center justify-end">
                <p className="text-xs font-bold uppercase tracking-wider text-[#022c22]/50">Tap for verification →</p>
              </div>
            </div>
          </div>

          {/* Back face */}
          <div
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-800 p-[1px]"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="flex h-full flex-col rounded-2xl bg-white/12 p-5 backdrop-blur-sm" style={{ border: '1px solid rgba(255,255,255,0.2)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">CodeSpectra</p>
                  <p className="text-2xl font-bold text-white">VERIFIED CREDENTIAL</p>
                </div>
                <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/25 px-3 py-1">
                  <span className="text-xs font-bold text-emerald-800">VERIFIED</span>
                </div>
              </div>

              <div className="mt-4 flex items-start justify-between gap-4">
                <div className="space-y-2.5 flex-1">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#022c22]/50">EMAIL</p>
                    <p className="text-sm font-bold text-[#022c22]/80">{email}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#022c22]/50">ROLE</p>
                    <p className="text-sm font-bold text-[#022c22]/80">{roleBadge}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#022c22]/50">ACCESS LEVEL</p>
                    <p className="text-sm font-bold text-[#022c22]/80">{role === 'superadmin' || role === 'tenant_admin' ? 'Full Access' : 'Standard'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#022c22]/50">EXPIRES</p>
                    <p className="text-xs font-bold text-[#022c22]/75">{exp}</p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 shrink-0">
                  {qrDataUrl ? (
                    <div className="h-[100px] w-[100px] rounded-lg bg-white p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrDataUrl} alt="QR" className="h-full w-full" />
                    </div>
                  ) : (
                    <div className="flex h-[100px] w-[100px] items-center justify-center rounded-lg bg-white p-1">
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-100 to-emerald-200 text-center text-[10px] font-bold text-emerald-800">
                        {initials}
                      </div>
                    </div>
                  )}
                  <div className="flex h-6 w-8 items-center justify-center rounded border border-[#022c22]/20 bg-[#022c22]/15">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#022c2280" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                </div>
              </div>

              <div className="flex-1" />
              <div className="flex items-center justify-end">
                <p className="text-xs font-bold uppercase tracking-wider text-[#022c22]/50">Tap to flip back →</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={(e) => { e.stopPropagation(); handleCopyId() }} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          {copied ? 'Copied!' : 'Copy ID'}
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleShare() }} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share Profile
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleDownload() }} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>
          Download QR Card
        </button>
      </div>

      {/* Info badges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>, color: 'emerald', title: 'Verified Identity', desc: 'Status is platform-verified.' },
          { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 12h4"/><path d="M10 8h4"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/></svg>, color: 'blue', title: 'Platform Authority', desc: 'Recognised platform-wide.' },
          { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/></svg>, color: 'purple', title: 'Instant Share', desc: 'QR works at events.' },
          { icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, color: 'emerald', title: 'Secure Access', desc: 'Tamper-proof credential.' },
        ].map((b) => (
          <div key={b.title} className="rounded-xl border border-border/60 bg-muted/15 p-3">
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-${b.color}-500/33 bg-${b.color}-500/13`}>
              <span className={`text-${b.color}-500`}>{b.icon}</span>
            </div>
            <p className="text-xs font-semibold text-foreground">{b.title}</p>
            <p className="text-[10px] text-muted-foreground">{b.desc}</p>
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

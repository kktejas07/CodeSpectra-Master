'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CertificateRenderer,
  type CertificateData,
  type TemplateKey,
} from '@/components/cert/CertificateTemplates'

const TEMPLATE_KEYS: TemplateKey[] = [
  'classic', 'modern', 'minimal', 'professional', 'corporate', 'academic',
]

/** Matches .cert-sheet aspect (globals.css). */
const CERT_W = 1123
const CERT_H = 794

function asTemplateKey(v: unknown): TemplateKey {
  const s = String(v || 'classic')
  return (TEMPLATE_KEYS.includes(s as TemplateKey) ? s : 'classic') as TemplateKey
}

/**
 * Scaled preview of the SuperAdmin-selected certificate template with a SAMPLE
 * watermark. Fits the container width via ResizeObserver (no overflow).
 */
export function CourseCertificatePreview({
  courseTitle,
  recipientName = 'Your Name',
}: {
  courseTitle: string
  recipientName?: string
}) {
  const [template, setTemplate] = useState<TemplateKey>('classic')
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.35)

  useEffect(() => {
    fetch('/api/platform/settings', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        const key = j?.settings?.certificate_template
        if (key) setTemplate(asTemplateKey(key))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setScale(Math.min(1, w / CERT_W))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const displayName = (recipientName || '').trim() || 'Your Name'

  const data: CertificateData = {
    candidateName: displayName,
    certificationTitle: courseTitle || 'Course',
    level: 'Completion',
    source: 'CodeSpectra Courses',
    score: 100,
    issuedAt: new Date().toISOString(),
    verifyUrl: 'https://codespectra.ai/cert/verify/sample',
    verifyToken: 'SAMPLE-PREVIEW',
    scoreLabel: 'Course completed',
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="absolute -top-1 -right-1 z-20 rotate-12">
        <span className="inline-block bg-slate-900 text-amber-300 text-[10px] font-bold tracking-[0.2em] uppercase px-3 py-1 shadow-lg rounded-sm">
          Sample
        </span>
      </div>

      <div
        ref={boxRef}
        className="relative w-full overflow-hidden rounded-xl border border-white/10 shadow-2xl bg-white"
        style={{ aspectRatio: `${CERT_W} / ${CERT_H}` }}
      >
        <div
          className="pointer-events-none origin-top-left"
          style={{
            width: CERT_W,
            height: CERT_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <CertificateRenderer data={data} template={template} />
        </div>

        <div
          aria-hidden
          className="absolute inset-0 z-10 pointer-events-none overflow-hidden"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-28deg, transparent, transparent 48px, rgba(15,23,42,0.07) 48px, rgba(15,23,42,0.07) 80px)',
          }}
        >
          <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-x-10 gap-y-8 opacity-40 select-none">
            {Array.from({ length: 12 }).map((_, i) => (
              <span
                key={i}
                className="text-slate-700/50 text-lg font-black tracking-[0.35em] uppercase -rotate-28"
              >
                SAMPLE
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-white/50 mt-3">
        Preview for {displayName} · SuperAdmin template · watermarked sample
      </p>
    </div>
  )
}

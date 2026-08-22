'use client'

import { useEffect, useState } from 'react'
import {
  CertificateRenderer,
  type CertificateData,
  type TemplateKey,
} from '@/components/cert/CertificateTemplates'

const TEMPLATE_KEYS: TemplateKey[] = [
  'classic', 'modern', 'minimal', 'professional', 'corporate', 'academic',
]

function asTemplateKey(v: unknown): TemplateKey {
  const s = String(v || 'classic')
  return (TEMPLATE_KEYS.includes(s as TemplateKey) ? s : 'classic') as TemplateKey
}

/**
 * Scaled preview of the SuperAdmin-selected certificate template with a SAMPLE
 * watermark (Unstop-style) so the mock cannot be screenshotted as a real cert.
 */
export function CourseCertificatePreview({
  courseTitle,
  recipientName = 'Your Name',
}: {
  courseTitle: string
  recipientName?: string
}) {
  const [template, setTemplate] = useState<TemplateKey>('classic')

  useEffect(() => {
    fetch('/api/platform/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        const key = j?.settings?.certificate_template
        if (key) setTemplate(asTemplateKey(key))
      })
      .catch(() => {})
  }, [])

  const data: CertificateData = {
    candidateName: recipientName,
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

      <div className="relative overflow-hidden rounded-xl border border-white/10 shadow-2xl bg-white aspect-4/3">
        <div
          className="origin-top-left pointer-events-none"
          style={{ width: 1123, height: 794, transform: 'scale(0.32)', transformOrigin: 'top left' }}
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
        Preview uses your SuperAdmin certificate template · watermarked sample
      </p>
    </div>
  )
}

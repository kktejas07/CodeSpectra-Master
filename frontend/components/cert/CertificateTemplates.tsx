/**
 * Certificate template components.
 *
 * Each template is a pure-presentation React component that renders an
 * A4-landscape certificate. Templates share the same `CertificateData`
 * shape so the verify page can swap between them at runtime via the
 * `?template=` query param.
 *
 * All templates are print-ready: a global `@media print` stylesheet in
 * `app/cert/verify/[token]/page.tsx` hides the surrounding chrome and
 * forces landscape orientation so the browser's "Save as PDF" output
 * is publication-quality.
 *
 * Visual styles use Tailwind utility classes — no external assets beyond
 * the QR code data URL, which is generated open-source via `qrcode`.
 *
 * Everything in this file is built from open-source primitives only:
 * Tailwind (MIT), lucide-react (ISC), qrcode (MIT). No proprietary
 * resources, no licensed fonts beyond system / open Google fonts.
 */

import { Award, CheckCircle2, Hash } from 'lucide-react'

export type TemplateKey = 'classic' | 'modern' | 'minimal' | 'professional' | 'corporate' | 'academic'

export interface CertificateData {
  candidateName: string
  certificationTitle: string
  level: string
  source: string
  score: number
  issuedAt: string
  verifyUrl: string
  verifyToken: string
  /** PNG/SVG data URL of the verify QR. */
  qrDataUrl?: string
  /** Optional override for the score line (e.g. "+420 XP earned" on level-up certs). */
  scoreLabel?: string
}

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

/** Score line shown on certs — `scoreLabel` wins so level-up certs say "+X XP" instead of "92%". */
const scoreText = (data: CertificateData) => data.scoreLabel || `${data.score}%`

/* -------------------- CLASSIC -------------------- */

export function ClassicCertificate({ data }: { data: CertificateData }) {
  return (
    <div
      data-testid="cert-canvas-classic"
      className="cert-sheet bg-[#fdfaf2] text-[#1c2c4c] relative overflow-hidden"
    >
      {/* Decorative double border + corner flourishes */}
      <div className="absolute inset-6 border-[6px] border-double border-[#b08d57]" />
      <div className="absolute inset-10 border border-[#1c2c4c]/30" />
      {/* Corner medallions */}
      {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((pos) => (
        <div
          key={pos}
          className={
            'absolute w-14 h-14 rounded-full bg-[#b08d57]/15 border border-[#b08d57] ' +
            (pos === 'top-left' ? 'top-12 left-12' :
              pos === 'top-right' ? 'top-12 right-12' :
              pos === 'bottom-left' ? 'bottom-12 left-12' : 'bottom-12 right-12')
          }
        />
      ))}

      <div className="relative h-full flex flex-col items-center justify-center px-24 py-16 text-center">
        <div className="flex items-center gap-3 text-[#b08d57]">
          <img src="/icon.svg" alt="CodeSpectra logo" className="h-10 w-10 rounded-lg" />
          <Award className="w-8 h-8" />
          <span className="font-serif tracking-[0.4em] text-sm uppercase">CodeSpectra</span>
        </div>

        <h1 className="font-serif text-5xl font-bold mt-10 tracking-tight">Certificate of Achievement</h1>
        <p className="text-sm mt-3 italic text-[#1c2c4c]/70">This certifies that</p>

        <p className="font-serif text-6xl font-semibold mt-6 mb-2" data-testid="cert-name">
          {data.candidateName}
        </p>
        <div className="w-2/3 border-b border-[#b08d57]/60 my-2" />

        <p className="text-base mt-6 max-w-2xl leading-relaxed">
          has successfully completed the assessment for
        </p>
        <p className="font-serif text-3xl font-semibold mt-3 text-[#1c2c4c]">
          {data.certificationTitle}
        </p>
        <p className="text-sm mt-2 text-[#1c2c4c]/70">
          <strong>Verified level: {data.level}</strong> · {scoreText(data)} on {dateFmt(data.issuedAt)}
        </p>

        <div className="mt-10 grid grid-cols-3 gap-12 items-end w-full max-w-2xl">
          <div className="text-center">
            <div className="border-t border-[#1c2c4c] pt-2 text-xs uppercase tracking-widest">Source</div>
            <p className="font-serif text-sm mt-1">{data.source}</p>
          </div>
          <div className="text-center flex flex-col items-center">
            {data.qrDataUrl && (
              <img
                src={data.qrDataUrl}
                alt="Verify QR"
                className="w-24 h-24 border border-[#b08d57]/30 p-1 bg-white"
              />
            )}
            <p className="text-[10px] mt-2 text-[#1c2c4c]/60 font-mono">Verify online</p>
          </div>
          <div className="text-center">
            <div className="border-t border-[#1c2c4c] pt-2 text-xs uppercase tracking-widest">Issued</div>
            <p className="font-serif text-sm mt-1">{dateFmt(data.issuedAt)}</p>
          </div>
        </div>

        <p className="text-[10px] mt-8 text-[#1c2c4c]/50 font-mono tracking-wide">
          Verify ID · {data.verifyToken}
        </p>
      </div>
    </div>
  )
}

/* -------------------- MODERN -------------------- */

export function ModernCertificate({ data }: { data: CertificateData }) {
  return (
    <div
      data-testid="cert-canvas-modern"
      className="cert-sheet bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0a5d3b] text-white relative overflow-hidden"
    >
      {/* Geometric accents */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="absolute top-0 right-0 w-1/3 h-full bg-emerald-500/5 [clip-path:polygon(40%_0,100%_0,100%_100%,0%_100%)]" />

      <div className="relative h-full grid grid-cols-[2fr_1fr] gap-12 px-20 py-14">
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 text-emerald-300">
              <img src="/icon.svg" alt="CodeSpectra logo" className="h-7 w-7 rounded-md" />
              <span className="text-xs uppercase tracking-[0.5em]">CodeSpectra</span>
            </div>
            <h1 className="text-5xl font-black mt-12 leading-none tracking-tight">
              Certificate
              <br />
              <span className="text-emerald-300">of Excellence</span>
            </h1>
            <p className="text-sm text-white/60 mt-6 uppercase tracking-widest">Awarded to</p>
            <p className="text-4xl font-bold mt-2" data-testid="cert-name">{data.candidateName}</p>
            <div className="h-1 w-32 bg-emerald-400 mt-4 rounded" />
          </div>

          <div>
            <p className="text-sm text-white/70 leading-relaxed max-w-md">
              For demonstrating mastery of the
              <span className="text-white font-semibold"> {data.certificationTitle} </span>
              assessment, sourced from open-source curricula at {data.source}.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end justify-between text-right">
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 w-full">
            <div className="flex items-center justify-end gap-2 text-emerald-300 text-xs uppercase tracking-widest">
              <CheckCircle2 className="w-4 h-4" />
              Verified level
            </div>
            <p className="text-6xl font-black mt-2 tracking-tight break-words" data-testid="cert-level">{data.level}</p>
            <p className="text-xs text-white/50 mt-1">{scoreText(data)} · verified</p>
          </div>

          <div className="w-full bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-4 flex items-center gap-3">
            {data.qrDataUrl && (
              <img src={data.qrDataUrl} alt="QR" className="w-20 h-20 rounded bg-white p-1" />
            )}
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-widest text-white/50">Verify online</p>
              <p className="text-[11px] font-mono text-white/80 break-all">
                {data.verifyUrl.replace(/^https?:\/\//, '')}
              </p>
              <p className="text-[10px] mt-1 text-emerald-300">Issued {dateFmt(data.issuedAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* -------------------- MINIMAL -------------------- */

export function MinimalCertificate({ data }: { data: CertificateData }) {
  return (
    <div
      data-testid="cert-canvas-minimal"
      className="cert-sheet bg-white text-neutral-900 relative overflow-hidden"
    >
      {/* Single accent bar */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-neutral-900" />
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-neutral-900" />

      <div className="h-full grid grid-cols-[1fr_auto] gap-16 px-24 py-16 items-center">
        <div>
          <p className="text-[10px] uppercase tracking-[0.5em] text-neutral-500">
            <img src="/icon.svg" alt="CodeSpectra logo" className="inline-block h-5 w-5 rounded-md mr-2 align-middle" />
            CodeSpectra
          </p>
          <h1 className="text-2xl font-light mt-12 tracking-wide text-neutral-500">Certificate of Completion</h1>
          <p className="text-6xl font-bold mt-6 tracking-tight" data-testid="cert-name">{data.candidateName}</p>
          <div className="h-px w-24 bg-neutral-900 mt-6" />
          <p className="text-lg mt-8 font-light max-w-xl leading-snug">
            has completed the <strong className="font-semibold">{data.certificationTitle}</strong> assessment,
            achieving a verified level of <strong className="font-semibold">{data.level}</strong> ({scoreText(data)}).
          </p>
          <div className="mt-12 flex items-center gap-8 text-xs uppercase tracking-widest text-neutral-500">
            <div>
              <p className="text-neutral-400">Level</p>
              <p className="text-neutral-900 mt-1">{data.level}</p>
            </div>
            <div>
              <p className="text-neutral-400">Issued</p>
              <p className="text-neutral-900 mt-1">{dateFmt(data.issuedAt)}</p>
            </div>
            <div>
              <p className="text-neutral-400">Source</p>
              <p className="text-neutral-900 mt-1">{data.source}</p>
            </div>
          </div>
          <div className="mt-10 flex items-center gap-2 text-[10px] font-mono text-neutral-400">
            <Hash className="w-3 h-3" />
            {data.verifyToken}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          {data.qrDataUrl && (
            <img src={data.qrDataUrl} alt="Verify QR" className="w-40 h-40" />
          )}
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">Scan to verify</p>
        </div>
      </div>
    </div>
  )
}

/* -------------------- PROFESSIONAL -------------------- */

export function ProfessionalCertificate({ data }: { data: CertificateData }) {
  return (
    <div
      data-testid="cert-canvas-professional"
      className="cert-sheet bg-gradient-to-br from-[#f0f4ff] to-[#e8eeff] text-[#1a2744] relative overflow-hidden"
    >
      {/* Blue accent bar */}
      <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-[#2563eb] via-[#3b82f6] to-[#2563eb]" />
      <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-r from-[#2563eb] via-[#3b82f6] to-[#2563eb]" />
      {/* Side accent */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] opacity-90" />

      <div className="relative h-full flex flex-col items-center justify-center pl-20 pr-24 py-16 text-center">
        <div className="absolute top-16 right-20 flex items-center gap-3">
          <img src="/icon.svg" alt="CodeSpectra logo" className="h-9 w-9 rounded-lg" />
          <span className="font-sans text-sm font-semibold tracking-wider uppercase text-[#2563eb]">CodeSpectra</span>
        </div>

        <div className="absolute left-8 top-1/2 -translate-y-1/2 -rotate-90 origin-center">
          <span className="text-white text-[10px] tracking-[0.5em] uppercase font-semibold">Professional Certificate</span>
        </div>

        <p className="text-sm uppercase tracking-[0.4em] text-[#2563eb] font-semibold">Certificate of Completion</p>
        <div className="w-16 h-0.5 bg-[#2563eb] mt-4 mb-6" />

        <p className="text-sm text-[#1a2744]/60">This is to certify that</p>
        <p className="font-sans text-5xl font-bold mt-4 mb-2" data-testid="cert-name">{data.candidateName}</p>
        <div className="w-1/2 border-b border-[#2563eb]/30 my-3" />

        <p className="text-sm mt-6 max-w-2xl text-[#1a2744]/70 leading-relaxed">
          has successfully completed the professional assessment for
        </p>
        <p className="font-sans text-2xl font-bold mt-3 text-[#2563eb]">{data.certificationTitle}</p>
        <p className="text-sm mt-2 text-[#1a2744]/60">
          Verified Level: <strong className="text-[#1a2744]">{data.level}</strong> · Score: {scoreText(data)}
        </p>

        <div className="mt-10 grid grid-cols-3 gap-10 items-end w-full max-w-xl">
          <div className="text-center">
            <div className="border-t border-[#1a2744]/30 pt-2 text-[10px] uppercase tracking-widest text-[#1a2744]/50">Issued By</div>
            <p className="text-sm mt-1 font-medium">{data.source}</p>
          </div>
          <div className="text-center flex flex-col items-center">
            {data.qrDataUrl && (
              <img src={data.qrDataUrl} alt="QR" className="w-20 h-20 border border-[#2563eb]/20 p-1 bg-white rounded" />
            )}
            <p className="text-[9px] mt-1 text-[#1a2744]/40 font-mono">Scan to verify</p>
          </div>
          <div className="text-center">
            <div className="border-t border-[#1a2744]/30 pt-2 text-[10px] uppercase tracking-widest text-[#1a2744]/50">Date</div>
            <p className="text-sm mt-1 font-medium">{dateFmt(data.issuedAt)}</p>
          </div>
        </div>

        <p className="text-[9px] mt-8 text-[#1a2744]/40 font-mono tracking-wide">ID: {data.verifyToken}</p>
      </div>
    </div>
  )
}

/* -------------------- CORPORATE -------------------- */

export function CorporateCertificate({ data }: { data: CertificateData }) {
  return (
    <div
      data-testid="cert-canvas-corporate"
      className="cert-sheet bg-[#0c1829] text-white relative overflow-hidden"
    >
      {/* Gold geometric accents */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#c9a84c] to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#c9a84c] to-transparent" />
      <div className="absolute top-8 left-8 right-8 h-px bg-[#c9a84c]/20" />
      <div className="absolute bottom-8 left-8 right-8 h-px bg-[#c9a84c]/20" />
      {/* Corner accents */}
      <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-[#c9a84c]/50" />
      <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-[#c9a84c]/50" />
      <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-[#c9a84c]/50" />
      <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-[#c9a84c]/50" />

      <div className="relative h-full flex flex-col items-center justify-center px-24 py-16 text-center">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="CodeSpectra logo" className="h-8 w-8 rounded-lg" />
          <span className="font-sans text-sm font-bold tracking-[0.4em] uppercase text-[#c9a84c]">CodeSpectra</span>
        </div>

        <h1 className="text-4xl font-light mt-10 tracking-wide text-white/90">Corporate Achievement</h1>
        <div className="w-24 h-px bg-[#c9a84c] mt-5 mb-6" />
        <p className="text-sm text-white/50 uppercase tracking-widest">Presented to</p>

        <p className="text-5xl font-bold mt-4 mb-2 text-white" data-testid="cert-name">{data.candidateName}</p>
        <div className="w-1/2 border-b border-[#c9a84c]/30 my-3" />

        <p className="text-sm mt-6 max-w-xl text-white/60 leading-relaxed">
          In recognition of successful completion of the <strong className="text-white">{data.certificationTitle}</strong> program
        </p>
        <p className="text-sm mt-2 text-[#c9a84c]">
          Level: <strong>{data.level}</strong> · Score: {scoreText(data)}
        </p>

        <div className="mt-10 grid grid-cols-3 gap-10 items-end w-full max-w-xl">
          <div className="text-center">
            <div className="border-t border-[#c9a84c]/30 pt-2 text-[10px] uppercase tracking-widest text-white/40">Issuing Authority</div>
            <p className="text-sm mt-1 text-white/80">{data.source}</p>
          </div>
          <div className="text-center flex flex-col items-center">
            {data.qrDataUrl && (
              <img src={data.qrDataUrl} alt="QR" className="w-20 h-20 rounded bg-white p-1" />
            )}
            <p className="text-[9px] mt-1 text-white/30 font-mono">Verify</p>
          </div>
          <div className="text-center">
            <div className="border-t border-[#c9a84c]/30 pt-2 text-[10px] uppercase tracking-widest text-white/40">Date of Issue</div>
            <p className="text-sm mt-1 text-white/80">{dateFmt(data.issuedAt)}</p>
          </div>
        </div>

        <p className="text-[9px] mt-8 text-white/30 font-mono tracking-wide">Certificate ID: {data.verifyToken}</p>
      </div>
    </div>
  )
}

/* -------------------- ACADEMIC -------------------- */

export function AcademicCertificate({ data }: { data: CertificateData }) {
  return (
    <div
      data-testid="cert-canvas-academic"
      className="cert-sheet bg-[#f7f3eb] text-[#2d3b2d] relative overflow-hidden"
    >
      {/* Academic green accents */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-[#2d5a3d]" />
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-[#2d5a3d]" />
      {/* Left green bar with crest area */}
      <div className="absolute left-0 top-0 bottom-0 w-28 bg-[#2d5a3d] flex items-center justify-center">
        <div className="w-20 h-20 rounded-full border-2 border-[#c9a84c] flex items-center justify-center">
          <Award className="w-10 h-10 text-[#c9a84c]" />
        </div>
      </div>
      {/* Seal watermark */}
      <div className="absolute right-20 bottom-20 w-32 h-32 rounded-full border border-[#2d5a3d]/10 opacity-30" />

      <div className="relative h-full flex flex-col items-center justify-center pl-36 pr-24 py-16 text-center">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="CodeSpectra logo" className="h-8 w-8 rounded-lg" />
          <span className="font-serif text-sm tracking-wider uppercase text-[#2d5a3d]">CodeSpectra</span>
        </div>

        <h1 className="font-serif text-4xl font-bold mt-8 text-[#2d5a3d]">Certificate of Distinction</h1>
        <p className="text-sm mt-3 italic text-[#2d3b2d]/60">This document certifies that</p>

        <p className="font-serif text-5xl font-bold mt-5 mb-2 text-[#2d3b2d]" data-testid="cert-name">{data.candidateName}</p>
        <div className="w-1/2 border-b border-[#2d5a3d]/30 my-3" />

        <p className="text-sm mt-5 max-w-xl text-[#2d3b2d]/70 leading-relaxed">
          has demonstrated academic excellence by successfully completing
        </p>
        <p className="font-serif text-2xl font-bold mt-3 text-[#2d5a3d]">{data.certificationTitle}</p>
        <p className="text-sm mt-2 text-[#2d3b2d]/60">
          Verified Level: <strong className="text-[#2d3b2d]">{data.level}</strong> · Score: {scoreText(data)}
        </p>

        <div className="mt-10 grid grid-cols-3 gap-10 items-end w-full max-w-xl">
          <div className="text-center">
            <div className="border-t border-[#2d5a3d]/30 pt-2 text-[10px] uppercase tracking-widest text-[#2d3b2d]/40">Curriculum Source</div>
            <p className="text-sm mt-1 font-medium text-[#2d3b2d]">{data.source}</p>
          </div>
          <div className="text-center flex flex-col items-center">
            {data.qrDataUrl && (
              <img src={data.qrDataUrl} alt="QR" className="w-20 h-20 border border-[#2d5a3d]/20 p-1 bg-white rounded" />
            )}
            <p className="text-[9px] mt-1 text-[#2d3b2d]/40 font-mono">Scan to verify</p>
          </div>
          <div className="text-center">
            <div className="border-t border-[#2d5a3d]/30 pt-2 text-[10px] uppercase tracking-widest text-[#2d3b2d]/40">Date Conferred</div>
            <p className="text-sm mt-1 font-medium text-[#2d3b2d]">{dateFmt(data.issuedAt)}</p>
          </div>
        </div>

        <p className="text-[9px] mt-8 text-[#2d3b2d]/40 font-mono tracking-wide">Academic Record ID: {data.verifyToken}</p>
      </div>
    </div>
  )
}

/* -------------------- Picker -------------------- */

export function CertificateRenderer({
  data,
  template,
}: {
  data: CertificateData
  template: TemplateKey
}) {
  if (template === 'modern') return <ModernCertificate data={data} />
  if (template === 'minimal') return <MinimalCertificate data={data} />
  if (template === 'professional') return <ProfessionalCertificate data={data} />
  if (template === 'corporate') return <CorporateCertificate data={data} />
  if (template === 'academic') return <AcademicCertificate data={data} />
  return <ClassicCertificate data={data} />
}

export const TEMPLATES: ReadonlyArray<{ key: TemplateKey; label: string; description: string }> = [
  { key: 'classic', label: 'Classic', description: 'Formal serif design with gold accents.' },
  { key: 'modern', label: 'Modern', description: 'Dark gradient with bold typography.' },
  { key: 'minimal', label: 'Minimal', description: 'Clean monochrome layout.' },
  { key: 'professional', label: 'Professional', description: 'Clean blue-white gradient with structured layout.' },
  { key: 'corporate', label: 'Corporate', description: 'Dark navy with gold corner accents.' },
  { key: 'academic', label: 'Academic', description: 'Traditional green-cream with crest emblem.' },
]

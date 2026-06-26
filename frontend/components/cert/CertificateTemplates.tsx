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

import { Award, CheckCircle2, Sparkles, Hash } from 'lucide-react'

export type TemplateKey = 'classic' | 'modern' | 'minimal'

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
}

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

/* -------------------- CLASSIC -------------------- */

export function ClassicCertificate({ data }: { data: CertificateData }) {
  return (
    <div
      data-testid="cert-template-classic"
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
          <Award className="w-10 h-10" />
          <span className="font-serif tracking-[0.4em] text-sm uppercase">CodeSpectra Open Academy</span>
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
          {data.level} level · scoring <strong>{data.score}%</strong> on {dateFmt(data.issuedAt)}
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
      data-testid="cert-template-modern"
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
              <Sparkles className="w-6 h-6" />
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
              Verified score
            </div>
            <p className="text-6xl font-black mt-2 tracking-tight">{data.score}%</p>
            <p className="text-xs text-white/50 mt-1">{data.level} level</p>
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
      data-testid="cert-template-minimal"
      className="cert-sheet bg-white text-neutral-900 relative overflow-hidden"
    >
      {/* Single accent bar */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-neutral-900" />
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-neutral-900" />

      <div className="h-full grid grid-cols-[1fr_auto] gap-16 px-24 py-16 items-center">
        <div>
          <p className="text-[10px] uppercase tracking-[0.5em] text-neutral-500">CodeSpectra · Open Curriculum</p>
          <h1 className="text-2xl font-light mt-12 tracking-wide text-neutral-500">Certificate of Completion</h1>
          <p className="text-6xl font-bold mt-6 tracking-tight" data-testid="cert-name">{data.candidateName}</p>
          <div className="h-px w-24 bg-neutral-900 mt-6" />
          <p className="text-lg mt-8 font-light max-w-xl leading-snug">
            has completed the <strong className="font-semibold">{data.certificationTitle}</strong> assessment,
            achieving a verified score of <strong className="font-semibold">{data.score}%</strong>.
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
  return <ClassicCertificate data={data} />
}

export const TEMPLATES: ReadonlyArray<{ key: TemplateKey; label: string; description: string }> = [
  { key: 'classic', label: 'Classic', description: 'Formal serif design with gold accents.' },
  { key: 'modern', label: 'Modern', description: 'Dark gradient with bold typography.' },
  { key: 'minimal', label: 'Minimal', description: 'Clean monochrome layout.' },
]

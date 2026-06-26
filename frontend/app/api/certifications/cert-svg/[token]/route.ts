/**
 * GET /api/certifications/cert-svg/[token]?template=classic|modern|minimal
 *
 * Server-side SVG certificate generator. Renders a self-contained vector
 * certificate (no external assets) including an inline SVG QR code. The
 * result is a downloadable `.svg` that can be opened in any viewer,
 * printed at any DPI, or vectorised into a logo.
 *
 * Why SVG and not PNG/PDF?
 *   - Zero new heavy dependencies (PNG requires `sharp` ~ 30 MB; PDF
 *     requires `@react-pdf/renderer` ~ 12 MB).
 *   - SVG is an open W3C standard. Users can convert to PDF or PNG in
 *     any browser by opening the file, then "Save as PDF".
 *
 * All used libs are OSI-approved open source:
 *   - `qrcode` (MIT) — QR code generation
 *
 * Public endpoint. Returns 404 for unknown/failed tokens.
 */
import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { certificationAttempts } from '@/lib/db/certifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Template = 'classic' | 'modern' | 'minimal'

interface CertData {
  candidateName: string
  certificationTitle: string
  level: string
  source: string
  score: number
  issuedAt: string
  verifyUrl: string
  verifyToken: string
}

function dateFmt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function qrSvg(text: string, size: number): Promise<string> {
  // `toString` returns inline SVG markup — strip the outer <?xml ?> + <svg>
  // wrapper so we can embed the inner shapes inside our larger document.
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    width: size,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
  return svg.replace(/<\?xml[^?]*\?>/g, '')
}

/* -------------------- Templates -------------------- */

async function renderClassic(d: CertData): Promise<string> {
  const qr = await qrSvg(d.verifyUrl, 120)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1123" height="794" viewBox="0 0 1123 794" font-family="Georgia, 'Times New Roman', serif">
  <rect width="1123" height="794" fill="#fdfaf2"/>
  <rect x="40" y="40" width="1043" height="714" fill="none" stroke="#b08d57" stroke-width="6"/>
  <rect x="56" y="56" width="1011" height="682" fill="none" stroke="#1c2c4c" stroke-width="1" stroke-opacity="0.3"/>
  <circle cx="100" cy="100" r="22" fill="#b08d5722" stroke="#b08d57"/>
  <circle cx="1023" cy="100" r="22" fill="#b08d5722" stroke="#b08d57"/>
  <circle cx="100" cy="694" r="22" fill="#b08d5722" stroke="#b08d57"/>
  <circle cx="1023" cy="694" r="22" fill="#b08d5722" stroke="#b08d57"/>

  <text x="561.5" y="170" text-anchor="middle" font-size="14" fill="#b08d57" letter-spacing="6">CODESPECTRA OPEN ACADEMY</text>
  <text x="561.5" y="240" text-anchor="middle" font-size="44" font-weight="bold" fill="#1c2c4c">Certificate of Achievement</text>
  <text x="561.5" y="280" text-anchor="middle" font-size="14" font-style="italic" fill="#1c2c4c" fill-opacity="0.7">This certifies that</text>
  <text x="561.5" y="370" text-anchor="middle" font-size="56" font-weight="600" fill="#1c2c4c">${escapeXml(d.candidateName)}</text>
  <line x1="287" y1="395" x2="836" y2="395" stroke="#b08d57" stroke-opacity="0.6"/>
  <text x="561.5" y="445" text-anchor="middle" font-size="16" fill="#1c2c4c">has successfully completed the assessment for</text>
  <text x="561.5" y="490" text-anchor="middle" font-size="26" font-weight="600" fill="#1c2c4c">${escapeXml(d.certificationTitle)}</text>
  <text x="561.5" y="520" text-anchor="middle" font-size="14" fill="#1c2c4c" fill-opacity="0.7">${escapeXml(d.level)} level · scoring ${d.score}% on ${dateFmt(d.issuedAt)}</text>

  <line x1="200" y1="640" x2="380" y2="640" stroke="#1c2c4c"/>
  <text x="290" y="660" text-anchor="middle" font-size="11" fill="#1c2c4c" letter-spacing="2">SOURCE</text>
  <text x="290" y="680" text-anchor="middle" font-size="14" fill="#1c2c4c">${escapeXml(d.source)}</text>

  <g transform="translate(501.5, 590)">${qr}</g>
  <text x="561.5" y="730" text-anchor="middle" font-size="9" fill="#1c2c4c" fill-opacity="0.6" font-family="monospace">Verify online</text>

  <line x1="743" y1="640" x2="923" y2="640" stroke="#1c2c4c"/>
  <text x="833" y="660" text-anchor="middle" font-size="11" fill="#1c2c4c" letter-spacing="2">ISSUED</text>
  <text x="833" y="680" text-anchor="middle" font-size="14" fill="#1c2c4c">${escapeXml(dateFmt(d.issuedAt))}</text>

  <text x="561.5" y="770" text-anchor="middle" font-size="9" fill="#1c2c4c" fill-opacity="0.5" font-family="monospace">Verify ID · ${escapeXml(d.verifyToken)}</text>
</svg>`
}

async function renderModern(d: CertData): Promise<string> {
  const qr = await qrSvg(d.verifyUrl, 100)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1123" height="794" viewBox="0 0 1123 794" font-family="Inter, system-ui, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0a5d3b"/>
    </linearGradient>
    <radialGradient id="glow1" cx="0" cy="0" r="1">
      <stop offset="0%" stop-color="#34d39933"/>
      <stop offset="100%" stop-color="#34d39900"/>
    </radialGradient>
  </defs>
  <rect width="1123" height="794" fill="url(#bg)"/>
  <circle cx="100" cy="100" r="280" fill="url(#glow1)"/>
  <circle cx="1023" cy="694" r="280" fill="url(#glow1)"/>
  <polygon points="750,0 1123,0 1123,794 600,794" fill="#10b98108"/>

  <g transform="translate(80, 90)">
    <text font-size="12" fill="#6ee7b7" letter-spacing="6">CODESPECTRA</text>
    <text y="120" font-size="56" font-weight="900" fill="#ffffff">Certificate</text>
    <text y="180" font-size="56" font-weight="900" fill="#6ee7b7">of Excellence</text>
    <text y="260" font-size="12" fill="#ffffff99" letter-spacing="3">AWARDED TO</text>
    <text y="310" font-size="40" font-weight="700" fill="#ffffff">${escapeXml(d.candidateName)}</text>
    <rect y="330" width="120" height="4" fill="#34d399" rx="2"/>
    <text y="560" font-size="13" fill="#ffffffaa">
      <tspan x="0">For demonstrating mastery of the</tspan>
      <tspan x="0" dy="20" font-weight="600" fill="#fff">${escapeXml(d.certificationTitle)}</tspan>
      <tspan x="0" dy="20">assessment, sourced from ${escapeXml(d.source)}.</tspan>
    </text>
  </g>

  <g transform="translate(750, 90)">
    <rect width="300" height="160" rx="20" fill="#ffffff0d" stroke="#ffffff1a"/>
    <text x="280" y="35" text-anchor="end" font-size="11" fill="#6ee7b7" letter-spacing="3">VERIFIED SCORE</text>
    <text x="280" y="115" text-anchor="end" font-size="72" font-weight="900" fill="#ffffff">${d.score}%</text>
    <text x="280" y="140" text-anchor="end" font-size="11" fill="#ffffff80">${escapeXml(d.level)} level</text>
  </g>

  <g transform="translate(750, 540)">
    <rect width="300" height="140" rx="20" fill="#ffffff0d" stroke="#ffffff1a"/>
    <g transform="translate(20, 20)"><rect width="100" height="100" fill="#fff" rx="6"/>${qr.replace('<svg ', '<svg x="0" y="0" ')}</g>
    <text x="140" y="50" font-size="9" fill="#ffffff80" letter-spacing="2">VERIFY ONLINE</text>
    <text x="140" y="70" font-size="10" fill="#ffffffcc" font-family="monospace">${escapeXml(d.verifyUrl.replace(/^https?:\/\//, '').slice(0, 30))}</text>
    <text x="140" y="100" font-size="10" fill="#6ee7b7">Issued ${escapeXml(dateFmt(d.issuedAt))}</text>
  </g>
</svg>`
}

async function renderMinimal(d: CertData): Promise<string> {
  const qr = await qrSvg(d.verifyUrl, 130)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1123" height="794" viewBox="0 0 1123 794" font-family="Inter, system-ui, sans-serif">
  <rect width="1123" height="794" fill="#ffffff"/>
  <rect x="0" y="0" width="1123" height="8" fill="#0a0a0a"/>
  <rect x="0" y="786" width="1123" height="8" fill="#0a0a0a"/>

  <g transform="translate(80, 100)">
    <text font-size="10" fill="#737373" letter-spacing="5">CODESPECTRA · OPEN CURRICULUM</text>
    <text y="120" font-size="22" font-weight="300" fill="#737373" letter-spacing="2">Certificate of Completion</text>
    <text y="220" font-size="64" font-weight="700" fill="#0a0a0a">${escapeXml(d.candidateName)}</text>
    <line x1="0" y1="240" x2="100" y2="240" stroke="#0a0a0a" stroke-width="1"/>
    <text y="300" font-size="18" font-weight="300" fill="#0a0a0a">
      <tspan x="0">has completed the <tspan font-weight="600">${escapeXml(d.certificationTitle)}</tspan> assessment,</tspan>
      <tspan x="0" dy="26">achieving a verified score of <tspan font-weight="600">${d.score}%</tspan>.</tspan>
    </text>

    <g transform="translate(0, 440)">
      <text font-size="10" fill="#a3a3a3" letter-spacing="3">LEVEL</text>
      <text y="20" font-size="13" fill="#0a0a0a">${escapeXml(d.level)}</text>
    </g>
    <g transform="translate(120, 440)">
      <text font-size="10" fill="#a3a3a3" letter-spacing="3">ISSUED</text>
      <text y="20" font-size="13" fill="#0a0a0a">${escapeXml(dateFmt(d.issuedAt))}</text>
    </g>
    <g transform="translate(260, 440)">
      <text font-size="10" fill="#a3a3a3" letter-spacing="3">SOURCE</text>
      <text y="20" font-size="13" fill="#0a0a0a">${escapeXml(d.source)}</text>
    </g>
    <text y="560" font-size="9" fill="#a3a3a3" font-family="monospace">${escapeXml(d.verifyToken)}</text>
  </g>

  <g transform="translate(850, 280)">${qr}</g>
  <text x="915" y="450" text-anchor="middle" font-size="9" fill="#737373" letter-spacing="2">SCAN TO VERIFY</text>
</svg>`
}

const RENDERERS: Record<Template, (d: CertData) => Promise<string>> = {
  classic: renderClassic,
  modern: renderModern,
  minimal: renderMinimal,
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const { searchParams } = new URL(req.url)
  const t = (searchParams.get('template') || 'classic') as Template
  const template: Template = RENDERERS[t] ? t : 'classic'

  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'bad-token' }, { status: 400 })
  }

  const attempts = await certificationAttempts()
  const attempt = await attempts.findOne({ verify_token: token, passed: true })
  if (!attempt) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  const origin = new URL(req.url).origin
  const data: CertData = {
    candidateName: attempt.snapshot.name || 'Anonymous Candidate',
    certificationTitle: attempt.cert_snapshot.title,
    level: attempt.cert_snapshot.level,
    source: attempt.cert_snapshot.source,
    score: attempt.score,
    issuedAt: attempt.submitted_at || attempt.started_at,
    verifyUrl: `${origin}/cert/verify/${token}`,
    verifyToken: token,
  }

  const svg = await RENDERERS[template](data)
  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="codespectra-${attempt.cert_snapshot.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${template}.svg"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}

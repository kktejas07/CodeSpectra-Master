import { formatDate } from '@/lib/format-datetime'
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams } from '@/lib/db/qr-events'
import { getGeneralSettings } from '@/lib/platform-general-settings-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderClassic(name: string, rank: number, total: number, eventName: string, slug: string, teamSlug: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1123" height="794" viewBox="0 0 1123 794">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#fefcf3"/>
        <stop offset="100%" style="stop-color:#f8f4e6"/>
      </linearGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#d4a843"/>
        <stop offset="50%" style="stop-color:#f5d77e"/>
        <stop offset="100%" style="stop-color:#d4a843"/>
      </linearGradient>
    </defs>
    <rect width="1123" height="794" fill="url(#bg)"/>
    <rect x="30" y="30" width="1063" height="734" fill="none" stroke="url(#gold)" stroke-width="4" rx="12"/>
    <rect x="45" y="45" width="1033" height="704" fill="none" stroke="url(#gold)" stroke-width="1.5" rx="8"/>
    <circle cx="100" cy="100" r="40" fill="none" stroke="url(#gold)" stroke-width="1.5"/>
    <circle cx="1023" cy="100" r="40" fill="none" stroke="url(#gold)" stroke-width="1.5"/>
    <circle cx="100" cy="694" r="40" fill="none" stroke="url(#gold)" stroke-width="1.5"/>
    <circle cx="1023" cy="694" r="40" fill="none" stroke="url(#gold)" stroke-width="1.5"/>
    <text x="561" y="140" font-family="serif" font-size="52" font-weight="bold" fill="#2d2d2d" text-anchor="middle" letter-spacing="6">CERTIFICATE</text>
    <text x="561" y="175" font-family="serif" font-size="18" fill="#8a7a4a" text-anchor="middle" letter-spacing="4">OF ACHIEVEMENT</text>
    <line x1="350" y1="200" x2="773" y2="200" stroke="#d4a843" stroke-width="1"/>
    <text x="561" y="260" font-family="sans-serif" font-size="20" fill="#666" text-anchor="middle">This certifies that</text>
    <text x="561" y="320" font-family="serif" font-size="42" font-weight="bold" fill="#2d2d2d" text-anchor="middle">${escapeXml(name)}</text>
    <text x="561" y="370" font-family="sans-serif" font-size="18" fill="#666" text-anchor="middle">ranked #${rank} of ${total} teams in</text>
    <text x="561" y="420" font-family="serif" font-size="28" font-weight="bold" fill="#d4a843" text-anchor="middle">${escapeXml(eventName)}</text>
    <text x="561" y="500" font-family="sans-serif" font-size="16" fill="#999" text-anchor="middle">${formatDate(new Date(), undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</text>
    <text x="561" y="600" font-family="sans-serif" font-size="12" fill="#bbb" text-anchor="middle">Verified on CodeSpectra</text>
  </svg>`
}

function renderModern(name: string, rank: number, total: number, eventName: string, slug: string, teamSlug: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1123" height="794" viewBox="0 0 1123 794">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1a1a2e"/>
        <stop offset="50%" style="stop-color:#16213e"/>
        <stop offset="100%" style="stop-color:#0f3460"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#00b4d8"/>
        <stop offset="100%" style="stop-color:#0077b6"/>
      </linearGradient>
    </defs>
    <rect width="1123" height="794" fill="url(#bg)"/>
    <rect x="40" y="40" width="1043" height="714" fill="none" stroke="url(#accent)" stroke-width="2" rx="4"/>
    <rect x="0" y="0" width="1123" height="120" fill="url(#accent)" opacity="0.3"/>
    <text x="561" y="85" font-family="sans-serif" font-size="44" font-weight="bold" fill="#e0e0e0" text-anchor="middle" letter-spacing="4">CERTIFICATE OF ACHIEVEMENT</text>
    <text x="561" y="200" font-family="sans-serif" font-size="18" fill="#90e0ef" text-anchor="middle">Awarded to</text>
    <text x="561" y="270" font-family="sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(name)}</text>
    <line x1="380" y1="295" x2="743" y2="295" stroke="#00b4d8" stroke-width="1.5"/>
    <text x="561" y="340" font-family="sans-serif" font-size="18" fill="#90e0ef" text-anchor="middle">Ranked #${rank} of ${total} teams</text>
    <text x="561" y="390" font-family="sans-serif" font-size="24" fill="#ccc" text-anchor="middle">${escapeXml(eventName)}</text>
    <circle cx="200" cy="500" r="60" fill="none" stroke="#00b4d8" stroke-width="1" opacity="0.3"/>
    <circle cx="923" cy="500" r="60" fill="none" stroke="#00b4d8" stroke-width="1" opacity="0.3"/>
    <text x="561" y="560" font-family="sans-serif" font-size="14" fill="#666" text-anchor="middle">${formatDate(new Date(), undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</text>
    <text x="561" y="650" font-family="sans-serif" font-size="12" fill="#444" text-anchor="middle">Verified on CodeSpectra</text>
  </svg>`
}

function renderMinimal(name: string, rank: number, total: number, eventName: string, slug: string, teamSlug: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1123" height="794" viewBox="0 0 1123 794">
    <rect width="1123" height="794" fill="#fafafa"/>
    <rect x="50" y="50" width="1023" height="694" fill="none" stroke="#333" stroke-width="1"/>
    <rect x="0" y="0" width="1123" height="4" fill="#333"/>
    <text x="561" y="120" font-family="sans-serif" font-size="16" fill="#999" text-anchor="middle" letter-spacing="8">CERTIFICATE</text>
    <text x="561" y="160" font-family="sans-serif" font-size="10" fill="#ccc" text-anchor="middle" letter-spacing="4">OF ACHIEVEMENT</text>
    <line x1="450" y1="180" x2="673" y2="180" fill="#333"/>
    <text x="561" y="280" font-family="sans-serif" font-size="16" fill="#999" text-anchor="middle">Awarded to</text>
    <text x="561" y="350" font-family="sans-serif" font-size="40" font-weight="bold" fill="#333" text-anchor="middle">${escapeXml(name)}</text>
    <text x="561" y="410" font-family="sans-serif" font-size="16" fill="#666" text-anchor="middle">#${rank} of ${total} · ${escapeXml(eventName)}</text>
    <text x="561" y="520" font-family="sans-serif" font-size="12" fill="#bbb" text-anchor="middle">${formatDate(new Date(), undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</text>
    <text x="561" y="600" font-family="sans-serif" font-size="10" fill="#ddd" text-anchor="middle">Verified on CodeSpectra</text>
  </svg>`
}

const TEMPLATES: Record<string, typeof renderClassic> = {
  classic: renderClassic,
  modern: renderModern,
  minimal: renderMinimal,
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const template = new URL(req.url).searchParams.get('template') || ''
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!hk.results_released) return NextResponse.json({ error: 'results not yet released' }, { status: 400 })

  const teamsCol = await hackathonTeams()
  const allTeams = await teamsCol.find({ hackathon_id: hk.id }).sort({ xp: -1 }).toArray()
  const myTeam = allTeams.find((t) => t.members.some((m) => m.user_id === user.id))
  if (!myTeam) return NextResponse.json({ error: 'you did not participate in this event' }, { status: 404 })

  const rank = allTeams.findIndex((t) => t.id === myTeam.id) + 1
  const settings = await getGeneralSettings()
  const tplKey = template || hk.cert_template || settings.certificate_template || 'classic'
  const render = TEMPLATES[tplKey] || renderClassic
  const certSvg = render(myTeam.name, rank, allTeams.length, hk.name, hk.slug, myTeam.slug)

  return new NextResponse(certSvg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Content-Disposition': `attachment; filename="certificate-${hk.slug}-${myTeam.slug}.svg"`,
    },
  })
}

import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { hackathons, hackathonTeams } from '@/lib/db/qr-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const col = await hackathons()
  const hk = await col.findOne({ $or: [{ id }, { slug: id }] })
  if (!hk) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!hk.results_released) return NextResponse.json({ error: 'results not yet released' }, { status: 400 })

  const teamsCol = await hackathonTeams()
  const allTeams = await teamsCol.find({ hackathon_id: hk.id }).sort({ xp: -1 }).toArray()
  const myTeam = allTeams.find((t) => t.members.some((m) => m.user_id === user.id))
  if (!myTeam) return NextResponse.json({ error: 'you did not participate in this event' }, { status: 404 })

  const rank = allTeams.findIndex((t) => t.id === myTeam.id) + 1

  // Generate certificate SVG
  const certSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#6366f1"/>
        <stop offset="100%" style="stop-color:#8b5cf6"/>
      </linearGradient>
    </defs>
    <rect width="800" height="600" fill="url(#bg)" rx="12"/>
    <rect x="20" y="20" width="760" height="560" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="4" rx="8"/>
    <text x="400" y="120" font-family="sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">Certificate of Achievement</text>
    <line x1="200" y1="145" x2="600" y2="145" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
    <text x="400" y="210" font-family="sans-serif" font-size="20" fill="rgba(255,255,255,0.9)" text-anchor="middle">This certifies that</text>
    <text x="400" y="260" font-family="sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(myTeam.name)}</text>
    <text x="400" y="310" font-family="sans-serif" font-size="20" fill="rgba(255,255,255,0.9)" text-anchor="middle">ranked #${rank} of ${allTeams.length} teams in</text>
    <text x="400" y="360" font-family="sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(hk.name)}</text>
    <text x="400" y="430" font-family="sans-serif" font-size="16" fill="rgba(255,255,255,0.7)" text-anchor="middle">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</text>
    <text x="400" y="490" font-family="sans-serif" font-size="14" fill="rgba(255,255,255,0.5)" text-anchor="middle">Verified on CodeSpectra</text>
    <text x="400" y="520" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.3)" text-anchor="middle">${hk.slug}-${myTeam.slug}-${Date.now()}</text>
  </svg>`

  return new NextResponse(certSvg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Content-Disposition': `attachment; filename="certificate-${hk.slug}-${myTeam.slug}.svg"`,
    },
  })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

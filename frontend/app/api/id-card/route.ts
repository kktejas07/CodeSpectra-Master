/**
 * GET /api/id-card
 *
 * Returns (creates on first call) the QR ID-card for the signed-in user.
 *
 * Response:
 *   {
 *     token,            // url-safe token
 *     url,              // absolute https URL embedded in the QR
 *     qr_svg,           // inline SVG string (ready to drop into the page)
 *     role_variant,     // 'user' | 'admin' | 'tenant' | 'recruiter'
 *     payload: { name, email, role, xp, level, achievements }
 *   }
 *
 * The QR token is permanent (no rotation) so printed badges stay valid;
 * dashboard data is always fetched fresh on scan.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import {
  getOrCreateIdCardToken,
  roleToVariant,
  xpToLevel,
} from '@/lib/db/qr-events'
import { getUserXp } from '@/lib/db/leaderboard'
import { generateQrSvg } from '@/lib/qr'

export const runtime = 'nodejs'

function absoluteOrigin(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
  if (env) return env
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    'localhost:3000'
  return `${proto}://${host}`
}

export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const requestedVariant = url.searchParams.get('variant') || ''
  const variant =
    ['user', 'admin', 'tenant', 'recruiter'].includes(requestedVariant)
      ? (requestedVariant as 'user' | 'admin' | 'tenant' | 'recruiter')
      : roleToVariant(user.role)

  const snapshot = { name: user.fullName || user.name || '', email: user.email, role: user.role }
  const tokenDoc = await getOrCreateIdCardToken(user.id, variant, snapshot)

  const xp = await getUserXp(user.id)
  const level = xpToLevel(xp)

  // Compute solved-count + simple achievement seeds from submissions.
  const dbi = await getMongoDb()
  const solvedRows = await dbi
    .collection('submissions')
    .aggregate<{ _id: string; count: number }>([
      { $match: { user_id: user.id, status: 'accepted' } },
      { $group: { _id: '$problem_id' } },
      { $count: 'count' },
    ])
    .toArray()
  const solvedCount = (solvedRows[0] as { count?: number } | undefined)?.count || 0

  const achievements: string[] = []
  if (solvedCount >= 1) achievements.push('First solve')
  if (solvedCount >= 5) achievements.push('5-problem streak')
  if (solvedCount >= 10) achievements.push('10-problem grinder')
  if (level >= 5) achievements.push(`Level ${level}`)
  // First-blood badge if any xp_events with reason=first_blood exist.
  const firstBlood = await dbi
    .collection('xp_events')
    .findOne({ user_id: user.id, reason: 'first_blood' })
  if (firstBlood) achievements.push('First-blood claimed')

  const absUrl = `${absoluteOrigin(req)}/qr/${tokenDoc.token}`
  const qrSvg = await generateQrSvg(absUrl, { size: 320 })

  return NextResponse.json({
    token: tokenDoc.token,
    url: absUrl,
    qr_svg: qrSvg,
    role_variant: tokenDoc.role_variant,
    payload: {
      user_id: user.id,
      name: snapshot.name,
      email: snapshot.email,
      role: user.role,
      xp,
      level,
      solved: solvedCount,
      achievements,
    },
  })
}

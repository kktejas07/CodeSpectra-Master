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
 *     role_variant,     // 'user' | 'admin' | 'tenant'
 *     payload: { name, email, role, xp, level, achievements }
 *   }
 *
 * The QR token is permanent (no rotation) so printed badges stay valid;
 * dashboard data is always fetched fresh on scan.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import type { IdCardRoleVariant } from '@/lib/db/qr-events'
import {
  getOrCreateIdCardToken,
  idCardTokens,
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
    (['user', 'admin', 'tenant'] as IdCardRoleVariant[]).includes(requestedVariant)
      ? (requestedVariant as IdCardRoleVariant)
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

/**
 * POST /api/id-card?action=revoke[&variant=...]
 *
 * Revokes the current token for the given variant (defaults to the role's
 * native variant) and immediately issues a fresh one. The old QR will
 * return 410 Gone on scan. This is useful when a printed badge is lost
 * or compromised.
 */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  if (action !== 'revoke') {
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }

  const requestedVariant = url.searchParams.get('variant') || ''
  const variant =
    (['user', 'admin', 'tenant'] as IdCardRoleVariant[]).includes(requestedVariant)
      ? (requestedVariant as IdCardRoleVariant)
      : roleToVariant(user.role)

  const col = await idCardTokens()
  const existing = await col.findOne({ user_id: user.id, role_variant: variant })
  if (existing) {
    // Insert a stub row preserving the OLD token + revoked_at so scans of
    // the printed badge resolve to 410 Gone via /api/qr/[token].
    await col.insertOne({
      id: `${existing.id}-revoked-${Date.now()}`,
      token: existing.token,
      user_id: existing.user_id,
      role_variant: existing.role_variant,
      snapshot: existing.snapshot,
      revoked_at: new Date().toISOString(),
      created_at: existing.created_at,
    })
    // Remove the active row so the next GET issues a fresh token.
    await col.deleteOne({ id: existing.id })
  }
  return NextResponse.json({ ok: true, revoked: !!existing })
}

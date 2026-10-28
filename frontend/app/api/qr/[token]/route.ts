/**
 * GET /api/qr/[token]
 *
 * Scan-resolution endpoint. Given a QR token, returns the kind
 * (`user` or `team`) and a *fresh* dashboard payload. The QR URL itself
 * lives at `/qr/{token}` (the page) — this is the JSON backend.
 *
 * Requires login — the QR token alone must not expose PII to anonymous
 * callers. Revoked tokens return 410 Gone.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { requireAuth } from '@/lib/route-auth'
import { nativeBadgeVariant } from '@/lib/auth-account'
import {
  idCardTokens,
  hackathonTeams,
  hackathons,
  type IdCardRoleVariant,
} from '@/lib/db/qr-events'
import { getUserXp } from '@/lib/db/leaderboard'
import { xpToLevel } from '@/lib/leaderboard-utils'
import { getGamificationConfig } from '@/lib/gamification-config'

export const runtime = 'nodejs'

interface UserDoc {
  _id: ObjectId | string
  email?: string
  name?: string
  fullName?: string
  role?: string
}

const ROLE_THEME: Record<IdCardRoleVariant, { label: string; accent: string; dashboard: string }> = {
  user: { label: 'Builder', accent: 'emerald', dashboard: '/dashboard' },
  admin: { label: 'Superadmin', accent: 'fuchsia', dashboard: '/dashboard/admin/system' },
  tenant: { label: 'Tenant admin', accent: 'sky', dashboard: '/dashboard/admin/team' },
  recruiter: { label: 'Recruiter', accent: 'amber', dashboard: '/dashboard' },
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 })

  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'Sign in required to scan this QR code' }, { status: 401 })
  }

  // ---- 1. Try id-card tokens ------------------------------------------
  const idCol = await idCardTokens()
  const idRow = await idCol.findOne({ token })
  if (idRow) {
    if (idRow.revoked_at) {
      return NextResponse.json({ error: 'revoked', code: 'qr_revoked', kind: 'user' }, { status: 410 })
    }
    const db = await getMongoDb()
    const u = ObjectId.isValid(idRow.user_id)
      ? ((await db.collection('user').findOne({ _id: new ObjectId(idRow.user_id) })) as UserDoc | null)
      : ((await db.collection('user').findOne({ _id: idRow.user_id as never })) as UserDoc | null)
    if (!u) return NextResponse.json({ error: 'user not found', code: 'user_not_found', kind: 'user' }, { status: 404 })

    const xp = await getUserXp(idRow.user_id)
    const level = xpToLevel(xp, (await getGamificationConfig()).levels)
    // Show the holder's CURRENT role at most: a badge minted while they were
    // an admin (or forged via ?variant=) never outranks their account today.
    const variant: IdCardRoleVariant = idRow.role_variant === nativeBadgeVariant(u.role ?? null) ? idRow.role_variant : 'user'
    const theme = ROLE_THEME[variant]
    const solvedAgg = await db
      .collection('submissions')
      .aggregate([
        { $match: { user_id: idRow.user_id, status: 'accepted' } },
        { $group: { _id: '$problem_id' } },
        { $count: 'count' },
      ])
      .toArray()
    const solved = (solvedAgg[0] as { count?: number } | undefined)?.count || 0
    const email = u.email || ''
    const name = (u.fullName || u.name || '').trim() || (email ? email.split('@')[0] : 'Member')

    return NextResponse.json({
      kind: 'user',
      role_variant: variant,
      theme,
      dashboard_url: theme.dashboard,
      user: {
        id: idRow.user_id,
        name,
        email,
        role: u.role || 'user',
        xp,
        level,
        solved,
        joined_at: idRow.created_at,
      },
    })
  }

  // ---- 2. Try hackathon team QR --------------------------------------
  const teamCol = await hackathonTeams()
  const team = await teamCol.findOne({ qr_token: token })
  if (team) {
    const hk = await (await hackathons()).findOne({ id: team.hackathon_id })
    return NextResponse.json({
      kind: 'team',
      role_variant: 'user',
      theme: { label: 'Team', accent: 'cyan', dashboard: hk ? `/hackathons/${hk.slug}/workspace` : '/' },
        dashboard_url: hk ? `/hackathons/${hk.slug}/workspace` : '/',
      team: {
        id: team.id,
        name: team.name,
        slug: team.slug,
        xp: team.xp,
        level: team.level,
        achievements: team.achievements,
        submissions: team.submissions,
members: team.members.map((m) => ({
  name: m.name,
  role: m.role,
  user_id: m.user_id,
})),
        created_at: team.created_at,
      },
      hackathon: hk
        ? { id: hk.id, name: hk.name, slug: hk.slug, status: hk.status, ends_at: hk.ends_at }
        : null,
    })
  }

  return NextResponse.json({ error: 'token not found' }, { status: 404 })
}

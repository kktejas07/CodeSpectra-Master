/**
 * QR / Hackathon data model + repository helpers.
 *
 * Collections introduced in Phase 10:
 *   - id_card_tokens   : signed-URL tokens for personal ID cards
 *   - hackathons       : event definitions (name, capacity, timing)
 *   - hackathon_teams  : per-team rows with embedded QR token + scoring
 *
 * IDs are UUIDv4 strings. Tokens are 32 base64url chars (`crypto.randomBytes(24)`).
 * Timestamps are ISO-8601 strings stored as strings (not BSON Date) so the
 * API layer can ship them straight to JSON without conversion.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export const newId = (): string => randomUUID()
export const nowIso = (): string => new Date().toISOString()

/** url-safe random token used inside signed QR URLs. */
export function newToken(): string {
  return randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export type IdCardRoleVariant = 'user' | 'admin' | 'tenant'

export interface IdCardTokenDoc {
  id: string
  token: string
  user_id: string
  /** Role-variant used when rendering the dashboard preview after scan. */
  role_variant: IdCardRoleVariant
  /** Optional metadata cached at issue time — refreshed lazily on scan. */
  snapshot?: {
    name?: string
    email?: string
    role?: string
  }
  revoked_at?: string | null
  created_at: string
}

export interface HackathonDoc {
  id: string
  name: string
  slug: string
  description?: string
  /** Total teams allowed. Used as the registration cap. */
  num_teams: number
  /** Maximum members per team. */
  max_per_team: number
  /** Event duration limit (minutes). starts_at + timeout = ends_at. */
  timeout_minutes: number
  starts_at: string
  ends_at: string
  status: 'draft' | 'open' | 'live' | 'closed'
  created_by: string
  created_at: string
  updated_at: string
}

export interface HackathonAchievement {
  id: string
  name: string
  awarded_at: string
}

export interface HackathonTeamDoc {
  id: string
  hackathon_id: string
  name: string
  slug: string
  qr_token: string
  members: Array<{ user_id: string; name: string; role: 'captain' | 'member' }>
  xp: number
  level: number
  achievements: HackathonAchievement[]
  submissions: number
  created_at: string
  updated_at: string
}

async function db() {
  return getMongoDb()
}

export async function idCardTokens(): Promise<Collection<IdCardTokenDoc>> {
  return (await db()).collection<IdCardTokenDoc>('id_card_tokens')
}
export async function hackathons(): Promise<Collection<HackathonDoc>> {
  return (await db()).collection<HackathonDoc>('hackathons')
}
export async function hackathonTeams(): Promise<Collection<HackathonTeamDoc>> {
  return (await db()).collection<HackathonTeamDoc>('hackathon_teams')
}

/**
 * Map a Better Auth role to the dashboard variant used on the public scan
 * page. Unknown roles default to `user`.
 */
export function roleToVariant(role?: string | null): IdCardRoleVariant {
  switch ((role || '').toLowerCase()) {
    case 'superadmin':
    case 'admin':
      return 'admin'
    case 'tenant_admin':
    case 'tenant':
      return 'tenant'
    default:
      return 'user'
  }
}

/**
 * Get the user's id-card token, creating it lazily on first request.
 * Idempotent: a single `(user_id, role_variant)` row exists per user.
 */
export async function getOrCreateIdCardToken(
  userId: string,
  roleVariant: IdCardRoleVariant,
  snapshot?: IdCardTokenDoc['snapshot'],
): Promise<IdCardTokenDoc> {
  const col = await idCardTokens()
  // Active = no `revoked_at` set. Revoked stubs are intentionally left
  // around so old QR scans resolve to 410.
  const existing = await col.findOne({
    user_id: userId,
    role_variant: roleVariant,
    $or: [{ revoked_at: null }, { revoked_at: { $exists: false } }],
  })
  if (existing) {
    // Refresh snapshot opportunistically (name/email might have changed).
    if (snapshot) {
      await col.updateOne(
        { id: existing.id },
        { $set: { snapshot } },
      )
      return { ...existing, snapshot }
    }
    return existing
  }
  const doc: IdCardTokenDoc = {
    id: newId(),
    token: newToken(),
    user_id: userId,
    role_variant: roleVariant,
    snapshot: snapshot ?? {},
    revoked_at: null,
    created_at: nowIso(),
  }
  await col.insertOne(doc)
  return doc
}

/** Level math — 1 level per 100 XP, matches `lib/leaderboard-utils.ts` xpToLevel. */
export function xpToLevel(xp: number): number {
  if (xp <= 0) return 1
  return Math.max(1, Math.floor(xp / 100) + 1)
}

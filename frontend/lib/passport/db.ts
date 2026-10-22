/**
 * Skill passport — data access (server only).
 *
 * Collection `skill_passports` (one per learner):
 *   user_id, handle (unique), visibility private|link|public, hidden[], shown[],
 *   show_self_reported, link_key (link-only sharing), nonce (credential
 *   revocation), issued_at, display_name, skills_index (for talent search),
 *   computed_at, talent {…} (opt-in discoverability, lib/talent/db.ts).
 *
 * Evidence is read live from the source collections each time (bounded,
 * newest first) — only released / completed / non-revoked rows count
 * (lib/passport/evidence-map.ts). The public page caches the result
 * (lib/cache/passport.ts) and every settings change purges it.
 */
import 'server-only'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { deriveServerKey } from '@/lib/session'
import { nowIso } from '@/lib/db/ids'
import {
  computePassport, handleBase, parseSelfReported, publicSkills, skillIndex, validHandle,
  type Evidence, type PassportShareSettings, type PassportSummary, type PassportVisibility, type PublicSkill,
} from './core'
import { certificateEvidence, companyTestEvidence, examEvidence, hackathonEvidence, interviewEvidence } from './evidence-map'
import { linkKeyMatches, newLinkKey, newNonce, signCredential, verifyCredential, type CredentialPayload } from './credential'

export const PASSPORTS = 'skill_passports'
const PER_SOURCE_LIMIT = 200

export interface TalentProfileDoc {
  discoverable: boolean
  consent?: { at: string; version: string; regime: string; country: string | null } | null
  withdrawn_at?: string | null
  city?: string | null
  country?: string | null
  graduation_year?: number | null
  availability?: string | null
  blocked_tenants?: string[]
}

export interface PassportDoc {
  user_id: string
  handle: string
  visibility: PassportVisibility
  hidden: string[]
  shown: string[]
  show_self_reported: boolean
  link_key: string
  nonce: string
  issued_at: string
  display_name: string
  skills_index?: Array<{ skill: string; level: string; rank: number; score: number }>
  top_skills?: string[]
  computed_at?: string
  talent?: TalentProfileDoc
  created_at: string
  updated_at: string
}

type Doc = Record<string, any>

let indexes: Promise<unknown> | null = null
export async function passports(): Promise<Collection<PassportDoc>> {
  const db = await getMongoDb()
  const col = db.collection<PassportDoc>(PASSPORTS)
  if (!indexes) {
    indexes = Promise.all([
      col.createIndex({ user_id: 1 }, { unique: true }),
      col.createIndex({ handle: 1 }, { unique: true }),
      col.createIndex({ 'talent.discoverable': 1, 'skills_index.skill': 1, 'skills_index.rank': 1 }),
      col.createIndex({ 'talent.discoverable': 1, 'talent.country': 1, 'talent.graduation_year': 1 }),
    ]).catch((e) => {
      indexes = null
      console.error('[passport] index build failed:', (e as Error)?.message)
    })
  }
  await indexes
  return col
}

export async function credentialKey(): Promise<Uint8Array> {
  return deriveServerKey('skill-passport')
}

async function userIdentity(db: Db, userId: string): Promise<{ name: string; username: string; selfSkills: string[] }> {
  const [u, ext] = await Promise.all([
    db.collection('user').findOne({ $or: [{ id: userId }, { _id: userId }] } as never, { projection: { name: 1, fullName: 1, username: 1 } }),
    db.collection('user_extended_profiles').findOne({ userId }, { projection: { _id: 0, skills: 1, 'basic.username': 1, 'basic.firstName': 1, 'basic.lastName': 1 } }),
  ])
  const first = String(ext?.basic?.firstName || '').trim()
  const last = String(ext?.basic?.lastName || '').trim()
  const name = String(u?.fullName || u?.name || `${first} ${last}`.trim() || 'CodeSpectra learner').slice(0, 120)
  return { name, username: String(ext?.basic?.username || u?.username || ''), selfSkills: parseSelfReported(ext?.skills) }
}

/** Find the learner's passport or create a private one (handle from their username). */
export async function getOrCreatePassport(userId: string): Promise<PassportDoc> {
  const col = await passports()
  const existing = await col.findOne({ user_id: userId }, { projection: { _id: 0 } })
  if (existing) return existing
  const db = await getMongoDb()
  const id = await userIdentity(db, userId)
  const base = validHandle(id.username) ? id.username : handleBase(id.username || id.name)
  const now = nowIso()
  for (let i = 0; i < 6; i++) {
    const handle = i === 0 && validHandle(base) ? base : `${base.slice(0, 22)}${Math.floor(1000 + Math.random() * 9000)}`
    const doc: PassportDoc = {
      user_id: userId, handle, visibility: 'private', hidden: [], shown: [], show_self_reported: false,
      link_key: newLinkKey(), nonce: newNonce(), issued_at: now, display_name: id.name, created_at: now, updated_at: now,
    }
    try {
      await col.updateOne({ user_id: userId }, { $setOnInsert: doc }, { upsert: true })
      const saved = await col.findOne({ user_id: userId }, { projection: { _id: 0 } })
      if (saved) return saved
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e
      const raced = await col.findOne({ user_id: userId }, { projection: { _id: 0 } })
      if (raced) return raced
      // handle taken by someone else → try a suffixed one
    }
  }
  throw new Error('Could not create a passport handle')
}

/** All verified evidence for one learner, newest first. Throws on DB errors (never cache an outage). */
export async function loadEvidence(userId: string, site = ''): Promise<Evidence[]> {
  const db = await getMongoDb()
  const [subs, practice, certs, teams, interviews] = await Promise.all([
    db.collection('exam_submissions').find(
      { user_id: userId, score_released: true },
      { projection: { _id: 0, id: 1, exam_id: 1, score: 1, max_score: 1, submitted_at: 1, score_released: 1, adaptive: 1, identity_check: 1, extension_detected: 1, trust_score: 1, integrity_score: 1, 'sections.name': 1, 'sections.title': 1 } },
    ).sort({ submitted_at: -1 }).limit(PER_SOURCE_LIMIT).toArray(),
    db.collection('company_test_attempts').find(
      { userId, status: 'completed' },
      { projection: { _id: 0, id: 1, patternId: 1, companyName: 1, examName: 1, status: 1, createdAt: 1, completedAt: 1, 'result.sections': 1 } },
    ).sort({ createdAt: -1 }).limit(PER_SOURCE_LIMIT).toArray(),
    db.collection('certification_attempts').find(
      { user_id: userId, passed: true, revoked_at: null } as never,
      { projection: { _id: 0, id: 1, certification_id: 1, issue_key: 1, passed: 1, revoked_at: 1, submitted_at: 1, started_at: 1, cert_snapshot: 1, verify_token: 1, score: 1, score_label: 1, rank: 1, certificate_kind: 1, exam_submission_id: 1, expires_at: 1, superseded_by: 1, proctored: 1, trust_score: 1, credential_id: 1 } },
    ).sort({ submitted_at: -1 }).limit(PER_SOURCE_LIMIT).toArray(),
    db.collection('hackathon_teams').find(
      { 'members.user_id': userId, final_rank: { $type: 'number' } },
      { projection: { _id: 0, id: 1, hackathon_id: 1, final_rank: 1, verify_token: 1 } },
    ).limit(PER_SOURCE_LIMIT).toArray(),
    db.collection('ai_mock_sessions').find(
      { userId, status: 'completed', 'report.overallScore': { $type: 'number' } },
      { projection: { _id: 0, id: 1, role: 1, status: 1, startedAt: 1, completedAt: 1, 'report.overallScore': 1 } },
    ).sort({ completedAt: -1 }).limit(50).toArray(),
  ])
  const examIds = [...new Set(subs.map((s) => String(s.exam_id)).filter(Boolean))]
  const hkIds = [...new Set(teams.map((t) => String(t.hackathon_id)).filter(Boolean))]
  const [examDocs, hkDocs] = await Promise.all([
    examIds.length ? db.collection('exams').find({ id: { $in: examIds } }, { projection: { _id: 0, id: 1, title: 1, subject: 1, adaptive_domain: 1, tenant_id: 1, proctoring_mode: 1 } }).toArray() : [],
    hkIds.length ? db.collection('hackathons').find({ id: { $in: hkIds } }, { projection: { _id: 0, id: 1, name: 1, slug: 1, results_released: 1, released_at: 1, end_date: 1, num_teams: 1, tracks: 1, tech_stack: 1 } }).toArray() : [],
  ])
  const exams = new Map(examDocs.map((e) => [String(e.id), e as Doc]))
  const hks = new Map(hkDocs.map((h) => [String(h.id), h as Doc]))
  const out: Evidence[] = []
  for (const s of subs) {
    const exam = exams.get(String(s.exam_id))
    const e = exam ? examEvidence(s as Doc, exam) : null
    if (e) out.push(e)
  }
  for (const a of practice) out.push(...companyTestEvidence(a as Doc))
  for (const c of certs) {
    const e = certificateEvidence(c as Doc, site)
    if (e) out.push(e)
  }
  for (const t of teams) {
    const hk = hks.get(String(t.hackathon_id))
    const e = hk ? hackathonEvidence(t as Doc, hk, site) : null
    if (e) out.push(e)
  }
  for (const s of interviews) {
    const e = interviewEvidence(s as Doc)
    if (e) out.push(e)
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

export function shareSettings(p: Pick<PassportDoc, 'visibility' | 'hidden' | 'shown' | 'show_self_reported'>): PassportShareSettings {
  return { visibility: p.visibility, hidden: p.hidden || [], shown: p.shown || [], showSelfReported: !!p.show_self_reported }
}

export interface OwnerPassport {
  passport: PassportDoc
  summary: PassportSummary
  evidence: Evidence[]
  publicSkills: PublicSkill[]
  credentialId: string
}

/**
 * The learner's own view: full summary (with excluded rows and learner links),
 * plus what the public sees. Refreshes the search index on the doc.
 */
export async function ownerPassport(userId: string, site = ''): Promise<OwnerPassport> {
  const passport = await getOrCreatePassport(userId)
  const db = await getMongoDb()
  const [evidence, id] = await Promise.all([loadEvidence(userId, site), userIdentity(db, userId)])
  const now = new Date()
  const summary = computePassport(evidence, id.selfSkills, now)
  const settings = shareSettings(passport)
  const pub = publicSkills(evidence, settings, now)
  // Talent search indexes only what the learner shows publicly.
  await (await passports()).updateOne(
    { user_id: userId },
    { $set: { skills_index: skillIndex(pub), top_skills: pub.slice(0, 8).map((s) => s.skill), computed_at: now.toISOString(), display_name: id.name } },
  )
  return { passport: { ...passport, display_name: id.name }, summary, evidence, publicSkills: pub, credentialId: await credentialFor(passport) }
}

export async function credentialFor(p: Pick<PassportDoc, 'handle' | 'nonce' | 'issued_at'>): Promise<string> {
  return signCredential(await credentialKey(), { h: p.handle, n: p.nonce, t: Date.parse(p.issued_at) || 0 })
}

// ─── Public view ────────────────────────────────────────────────────────────

export interface PublicPassportView {
  handle: string
  name: string
  visibility: PassportVisibility
  /** Server-side only: compared with ?k= for link-only passports. Never sent to the browser. */
  linkKey: string
  credentialId: string
  issuedAt: string
  computedAt: string
  skills: PublicSkill[]
  selfReported: string[] | null
}

/** Uncached loader for /p/[handle] (lib/cache/passport.ts wraps it). Null when missing or private. */
export async function loadPublicPassport(handle: string, site = ''): Promise<PublicPassportView | null> {
  if (!validHandle(handle)) return null
  const p = await (await passports()).findOne({ handle }, { projection: { _id: 0 } })
  if (!p || p.visibility === 'private') return null
  const db = await getMongoDb()
  const [evidence, id] = await Promise.all([loadEvidence(p.user_id, site), userIdentity(db, p.user_id)])
  const now = new Date()
  const settings = shareSettings(p)
  const skills = publicSkills(evidence, settings, now)
  const verified = new Set(skills.map((s) => s.skill))
  return {
    handle: p.handle,
    name: id.name,
    visibility: p.visibility,
    linkKey: p.link_key,
    credentialId: await credentialFor(p),
    issuedAt: p.issued_at,
    computedAt: now.toISOString(),
    skills,
    selfReported: settings.showSelfReported ? id.selfSkills.filter((s) => !verified.has(s)) : null,
  }
}

/** Can this visitor see the view? Public: yes. Link-only: with the right ?k=. */
export function canViewPassport(view: Pick<PublicPassportView, 'visibility' | 'linkKey'>, key: unknown): boolean {
  if (view.visibility === 'public') return true
  return view.visibility === 'link' && linkKeyMatches(key, view.linkKey)
}

/**
 * Live (uncached, one indexed read) sharing state for a handle. The public
 * page checks this before using the cached view, so a passport made private
 * or a rotated link key takes effect at once even if a cache purge was missed.
 */
export async function passportAccess(handle: string): Promise<{ visibility: PassportVisibility; linkKey: string } | null> {
  if (!validHandle(handle)) return null
  const p = await (await passports()).findOne({ handle }, { projection: { _id: 0, visibility: 1, link_key: 1 } })
  return p ? { visibility: p.visibility, linkKey: p.link_key } : null
}

// ─── Verification ───────────────────────────────────────────────────────────

export type VerifyResult =
  | { status: 'invalid' }
  | { status: 'revoked'; issuedAt: string }
  | { status: 'private'; name: string; issuedAt: string }
  | { status: 'valid'; name: string; handle: string; issuedAt: string; visibility: PassportVisibility; skills: PublicSkill[]; linkKey: string }

export async function verifyPassportCredential(credentialId: string, site = ''): Promise<VerifyResult> {
  const payload: CredentialPayload | null = verifyCredential(await credentialKey(), credentialId)
  if (!payload) return { status: 'invalid' }
  const p = await (await passports()).findOne({ handle: payload.h }, { projection: { _id: 0 } })
  const issuedAt = new Date(payload.t).toISOString()
  if (!p) return { status: 'revoked', issuedAt }
  if (p.nonce !== payload.n) return { status: 'revoked', issuedAt }
  const db = await getMongoDb()
  const id = await userIdentity(db, p.user_id)
  if (p.visibility === 'private') return { status: 'private', name: id.name, issuedAt }
  const skills = publicSkills(await loadEvidence(p.user_id, site), shareSettings(p))
  return { status: 'valid', name: id.name, handle: p.handle, issuedAt, visibility: p.visibility, skills, linkKey: p.link_key }
}

// ─── Settings ───────────────────────────────────────────────────────────────

export interface PassportSettingsPatch {
  visibility?: PassportVisibility
  hidden?: string[]
  shown?: string[]
  show_self_reported?: boolean
  handle?: string
  rotate?: boolean
}

export class PassportError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

/** Apply a validated patch. Returns old + new handle so callers can purge both caches. */
export async function updatePassportSettings(userId: string, patch: PassportSettingsPatch): Promise<{ before: PassportDoc; after: PassportDoc }> {
  const before = await getOrCreatePassport(userId)
  const $set: Partial<PassportDoc> = { updated_at: nowIso() }
  if (patch.visibility) $set.visibility = patch.visibility
  if (patch.hidden) $set.hidden = [...new Set(patch.hidden)].slice(0, 500)
  if (patch.shown) $set.shown = [...new Set(patch.shown)].slice(0, 500)
  if (typeof patch.show_self_reported === 'boolean') $set.show_self_reported = patch.show_self_reported
  if (patch.handle && patch.handle !== before.handle) {
    if (!validHandle(patch.handle)) throw new PassportError('Use 3–30 lowercase letters, numbers or single hyphens.', 400)
    $set.handle = patch.handle
  }
  if (patch.rotate) {
    // New link key + nonce: old link-only URLs and old credential ids stop working.
    $set.link_key = newLinkKey()
    $set.nonce = newNonce()
    $set.issued_at = nowIso()
  }
  const col = await passports()
  try {
    await col.updateOne({ user_id: userId }, { $set })
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) throw new PassportError('That handle is taken. Try another one.', 409)
    throw e
  }
  const after = await col.findOne({ user_id: userId }, { projection: { _id: 0 } })
  if (!after) throw new PassportError('Passport not found', 404)
  return { before, after }
}

/**
 * Parent / guardian weekly reports (service).
 *
 * The learner invites a guardian (explicit learner consent; max 2). The guardian accepts on
 * /guardian/accept (and chooses email and/or WhatsApp — their own consent). When the learner
 * is a minor per their profile (or says so), the guardian must also verify: the link goes by
 * email, a 6-digit code by WhatsApp to the guardian's phone, plus "I am the parent / legal
 * guardian". The learner chooses what is shared and can revoke at any time; the guardian can
 * unsubscribe from every email. Weekly summaries (lib/guardian/summary.ts) carry aggregates
 * only — never answers, question text, proctoring snapshots or unreleased scores.
 */
import 'server-only'
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import { redactString } from '@/lib/log-redact'
import { getAppOrigin } from '@/lib/app-origin'
import { outboundT } from '@/lib/i18n/outbound'
import type { Locale } from '@/lib/i18n/config'
import { phoneKey, isWhatsAppOptedOut } from '@/lib/whatsapp-send'
import { toE164 } from '@/lib/ats/phone'
import {
  buildGuardianSummary, checkGuardianContact, dueLinkFilter, guardianTemplateParams, isMinorProfile, normalizeShare, renderGuardianEmail, reportDue, summaryLines,
  DEFAULT_SHARE, MAX_GUARDIANS, type GuardianSummary, type Relation, type ShareSettings,
} from './summary'

export class GuardianError extends Error {
  constructor(public code: string, public status = 400, public params?: Record<string, string | number>) {
    super(code)
  }
}

export type LinkStatus = 'invited' | 'active' | 'declined' | 'revoked' | 'unsubscribed'

export interface GuardianLink {
  id: string
  learner_id: string
  guardian: { name: string; email: string | null; phone: string | null; phone_key: string | null; relation: Relation; locale: Locale }
  share: ShareSettings
  /** The guardian's own channel choice (set when they accept; the learner can only narrow it). */
  channels: { email: boolean; whatsapp: boolean }
  status: LinkStatus
  learner_consent: { at: string; text: string }
  minor: boolean
  invite: { token_hash: string; expires_at: string; code_hash: string | null; code_attempts: number; sent_at: string } | null
  verification: { at: string; method: 'link' | 'link_code_attest' } | null
  guardian_consent: { at: string; email: boolean; whatsapp: boolean; text: string } | null
  timezone: string
  last_report_week: string | null
  last_report_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export const LEARNER_CONSENT_TEXT = 'I want this person to receive a weekly summary of my progress. I choose what is shared and can stop it at any time.'
export const GUARDIAN_CONSENT_TEXT = 'I agree to receive a weekly progress summary for this learner from CodeSpectra on the channels I chose. I can unsubscribe at any time.'

const INVITE_TTL_MS = 7 * 86_400_000
const MAX_CODE_ATTEMPTS = 5
const nowIso = () => new Date().toISOString()
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const safeEq = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

let indexed: Promise<void> | null = null
async function db(): Promise<Db> {
  const d = await getMongoDb()
  if (!indexed) {
    indexed = Promise.all([
      d.collection('guardian_links').createIndex({ id: 1 }, { unique: true, name: 'gl_id' }),
      d.collection('guardian_links').createIndex({ learner_id: 1, status: 1 }, { name: 'gl_learner_status' }),
      d.collection('guardian_links').createIndex({ 'invite.token_hash': 1 }, { sparse: true, name: 'gl_invite_token' }),
      d.collection('guardian_links').createIndex({ status: 1, last_report_week: 1 }, { name: 'gl_status_week' }),
      d.collection('guardian_report_log').createIndex({ link_id: 1, week: 1, channel: 1 }, { unique: true, name: 'grl_link_week_channel' }),
    ]).then(() => undefined).catch((e) => { indexed = null; logger.warn(`[guardian] index setup: ${(e as Error).message}`) })
  }
  return d
}
const links = async (): Promise<Collection<GuardianLink>> => (await db()).collection<GuardianLink>('guardian_links')

// ─── Unsubscribe token (HMAC of the link id, nothing stored) ────────────────

async function unsubKey(): Promise<Uint8Array> {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('guardian-unsub')
}
export async function unsubscribeToken(linkId: string): Promise<string> {
  return createHmac('sha256', Buffer.from(await unsubKey())).update(linkId).digest('hex').slice(0, 32)
}
export async function unsubscribeUrl(linkId: string): Promise<string> {
  return `${getAppOrigin()}/guardian/unsubscribe?l=${encodeURIComponent(linkId)}&t=${await unsubscribeToken(linkId)}`
}

// ─── Learner side ───────────────────────────────────────────────────────────

export interface InviteInput {
  name: string
  email?: string | null
  phone?: string | null
  phone_country?: string | null
  relation: Relation
  locale: Locale
  share?: Partial<ShareSettings>
  declared_minor?: boolean
  timezone?: string
  consent: boolean
}

export interface GuardianView {
  id: string
  name: string
  relation: Relation
  email_masked: string | null
  phone_masked: string | null
  locale: Locale
  status: LinkStatus
  needs_verification: boolean
  verified: boolean
  share: ShareSettings
  channels: { email: boolean; whatsapp: boolean }
  invite_expires_at: string | null
  last_report_at: string | null
  created_at: string
}

const maskEmail = (e: string) => { const [u, d] = e.split('@'); return `${u.slice(0, 2)}•••@${d}` }
const maskPhone = (p: string) => `${p.slice(0, 3)}••••${p.slice(-3)}`

export function guardianView(l: GuardianLink): GuardianView {
  return {
    id: l.id,
    name: l.guardian.name,
    relation: l.guardian.relation,
    email_masked: l.guardian.email ? maskEmail(l.guardian.email) : null,
    phone_masked: l.guardian.phone ? maskPhone(l.guardian.phone) : null,
    locale: l.guardian.locale,
    status: l.status,
    needs_verification: l.minor,
    verified: !!l.verification,
    share: l.share,
    channels: l.channels,
    invite_expires_at: l.status === 'invited' ? l.invite?.expires_at ?? null : null,
    last_report_at: l.last_report_at,
    created_at: l.created_at,
  }
}

async function learnerFacts(userId: string): Promise<{ email: string | null; phoneKeys: string[]; firstName: string; profile: Record<string, unknown> | null }> {
  const d = await db()
  const u = (await d.collection('user').findOne({ $or: [{ id: userId }, { _id: userId as never }] }, { projection: { email: 1, name: 1, phone: 1, mobile: 1, phone_number: 1, whatsapp: 1, date_of_birth: 1, dob: 1, birth_year: 1 } })) as Record<string, unknown> | null
  const ext = (await d.collection('user_extended_profiles').findOne({ userId }, { projection: { basic: 1 } })) as { basic?: Record<string, unknown> } | null
  const basic = ext?.basic || {}
  const phones = [u?.phone, u?.mobile, u?.phone_number, u?.whatsapp, basic.phone].map((p) => (typeof p === 'string' ? phoneKey(p) : null)).filter((x): x is string => !!x)
  const wa = await d.collection('wa_practice_enrollments').findOne({ user_id: userId }, { projection: { phone_key: 1 } }).catch(() => null)
  if (wa?.phone_key) phones.push(String(wa.phone_key))
  const firstName = String(basic.firstName || u?.name || '').trim().split(/\s+/)[0] || 'Your learner'
  return {
    email: typeof u?.email === 'string' ? u.email : null,
    phoneKeys: [...new Set(phones)],
    firstName: firstName.slice(0, 40),
    profile: { date_of_birth: basic.dateOfBirth ?? basic.date_of_birth ?? u?.date_of_birth, dob: basic.dob ?? u?.dob, birth_year: basic.birthYear ?? u?.birth_year },
  }
}

export async function listGuardians(userId: string): Promise<GuardianLink[]> {
  return (await links()).find({ learner_id: userId, status: { $in: ['invited', 'active'] } }, { projection: { _id: 0 } }).sort({ created_at: 1 }).toArray() as Promise<GuardianLink[]>
}

/** Is the learner treated as a minor (profile, or their own answer)? */
export async function learnerIsMinor(userId: string, declared = false): Promise<boolean> {
  const f = await learnerFacts(userId)
  return isMinorProfile({ ...f.profile, declared_minor: declared })
}

export async function inviteGuardian(userId: string, input: InviteInput, now = new Date()): Promise<{ link: GuardianLink }> {
  if (!input.consent) throw new GuardianError('guardian_consent_required')
  const col = await links()
  const current = await col.countDocuments({ learner_id: userId, status: { $in: ['invited', 'active'] } })
  if (current >= MAX_GUARDIANS) throw new GuardianError('guardian_limit', 409, { max: MAX_GUARDIANS })
  const facts = await learnerFacts(userId)
  const minor = isMinorProfile({ ...facts.profile, declared_minor: input.declared_minor === true }, now)
  const email = input.email ? input.email.trim().toLowerCase() : null
  const phone = input.phone ? toE164(input.phone, input.phone_country || 'IN') : null
  if (input.phone && !phone) throw new GuardianError('guardian_phone_invalid')
  const pk = phone ? phoneKey(phone) : null
  const check = checkGuardianContact({ email, phoneKey: pk }, { email: facts.email, phoneKeys: facts.phoneKeys }, minor)
  if (!check.ok) throw new GuardianError(check.code)
  const dup = await col.findOne({ learner_id: userId, status: { $in: ['invited', 'active'] }, $or: [...(email ? [{ 'guardian.email': email }] : []), ...(pk ? [{ 'guardian.phone_key': pk }] : [])] }, { projection: { id: 1 } })
  if (dup) throw new GuardianError('guardian_duplicate', 409)

  const token = randomBytes(24).toString('base64url')
  const code = minor ? String(randomInt(0, 1_000_000)).padStart(6, '0') : null
  const at = now.toISOString()
  const link: GuardianLink = {
    id: randomBytes(9).toString('base64url'),
    learner_id: userId,
    guardian: { name: input.name.trim().slice(0, 80), email, phone, phone_key: pk, relation: input.relation, locale: input.locale },
    share: normalizeShare(input.share, DEFAULT_SHARE),
    channels: { email: !!email, whatsapp: false },
    status: 'invited',
    learner_consent: { at, text: LEARNER_CONSENT_TEXT },
    minor,
    invite: { token_hash: sha(token), expires_at: new Date(now.getTime() + INVITE_TTL_MS).toISOString(), code_hash: code ? sha(`${token}:${code}`) : null, code_attempts: 0, sent_at: at },
    verification: null,
    guardian_consent: null,
    timezone: input.timezone || 'Asia/Kolkata',
    last_report_week: null,
    last_report_at: null,
    revoked_at: null,
    created_at: at,
    updated_at: at,
  }
  await col.insertOne(link)
  await sendInvite(link, token, code, facts.firstName)
  logger.info(`[guardian] invite ${link.id} created (minor=${minor})`)
  return { link }
}

async function sendInvite(l: GuardianLink, token: string, code: string | null, learnerName: string): Promise<void> {
  const t = outboundT('email', l.guardian.locale)
  const url = `${getAppOrigin()}/guardian/accept?token=${encodeURIComponent(token)}`
  if (l.guardian.email) {
    const { escapeHtml } = await import('@/lib/safe-html')
    const html = `<!doctype html><html lang="${l.guardian.locale}"><body style="margin:0;background:#f3f5fb"><div style="padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1729">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e3e7f1;border-radius:16px;overflow:hidden">
<tr><td style="background:#2F5BE7;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700">CodeSpectra</td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:22px;color:#0f1729">${escapeHtml(t('guardian.inviteHeading', { name: learnerName }))}</h1>
<p style="font-size:15px;line-height:1.6">${escapeHtml(t('guardian.inviteBody', { name: learnerName }))}</p>
${code ? `<p style="font-size:15px;line-height:1.6">${escapeHtml(t('guardian.inviteCodeNote'))}</p>` : ''}
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#2F5BE7;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(t('guardian.inviteButton'))}</a></p>
<p style="font-size:13px;color:#4b5563">${escapeHtml(t('guardian.inviteIgnore'))}</p></td></tr></table></div></body></html>`
    const { sendEmail } = await import('@/lib/send-email')
    const r = await sendEmail(l.guardian.email, { subject: t('guardian.inviteSubject', { name: learnerName }), html }, undefined, { category: 'guardian' })
    if (!r.success && !r.queued) logger.warn(`[guardian] invite email failed for ${l.id}`)
  }
  if (l.guardian.phone) {
    const { sendLocalizedTemplate } = await import('@/lib/wa-practice/transport')
    const tn = outboundT('notify', l.guardian.locale)
    // Minor: the code goes by WhatsApp (a second channel), the link by email.
    const r = code
      ? await sendLocalizedTemplate(l.guardian.phone, { name: 'cs_guardian_verify', locale: l.guardian.locale, params: [code], preview: tn('guardian.verifyPreview', { code }) })
      : !l.guardian.email
        ? await sendLocalizedTemplate(l.guardian.phone, { name: 'cs_guardian_invite', locale: l.guardian.locale, params: [learnerName, url.slice(0, 60)], preview: tn('guardian.invitePreview', { name: learnerName }) })
        : { ok: true }
    if (!r.ok) logger.warn(`[guardian] invite WhatsApp failed for ${l.id}: ${redactString(String((r as { error?: string }).error || ''))}`)
  }
}

export async function updateGuardian(userId: string, linkId: string, patch: { share?: Partial<ShareSettings>; channels?: { email?: boolean; whatsapp?: boolean } }): Promise<GuardianLink> {
  const col = await links()
  const l = (await col.findOne({ id: linkId, learner_id: userId, status: { $in: ['invited', 'active'] } }, { projection: { _id: 0 } })) as GuardianLink | null
  if (!l) throw new GuardianError('guardian_not_found', 404)
  const share = patch.share ? normalizeShare(patch.share, l.share) : l.share
  // The learner can switch a channel off, never on beyond what the guardian agreed to.
  const agreed = l.guardian_consent || { email: !!l.guardian.email, whatsapp: false }
  const channels = {
    email: (patch.channels?.email ?? l.channels.email) && agreed.email,
    whatsapp: (patch.channels?.whatsapp ?? l.channels.whatsapp) && agreed.whatsapp,
  }
  await col.updateOne({ id: l.id }, { $set: { share, channels, updated_at: nowIso() } })
  return { ...l, share, channels }
}

export async function revokeGuardian(userId: string, linkId: string): Promise<void> {
  const r = await (await links()).updateOne({ id: linkId, learner_id: userId, status: { $in: ['invited', 'active'] } }, { $set: { status: 'revoked', invite: null, revoked_at: nowIso(), updated_at: nowIso() } })
  if (!r.matchedCount) throw new GuardianError('guardian_not_found', 404)
  logger.info(`[guardian] link ${linkId} revoked by learner`)
}

// ─── Guardian side (token pages) ────────────────────────────────────────────

async function linkByToken(token: string): Promise<GuardianLink | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const l = (await (await links()).findOne({ 'invite.token_hash': sha(token), status: 'invited' }, { projection: { _id: 0 } })) as GuardianLink | null
  if (!l || !l.invite || Date.parse(l.invite.expires_at) < Date.now()) return null
  return l
}

export interface InvitePreview { learner_name: string; guardian_name: string; minor: boolean; share: ShareSettings; has_email: boolean; has_phone: boolean; locale: Locale }

export async function invitePreview(token: string): Promise<InvitePreview | null> {
  const l = await linkByToken(token)
  if (!l) return null
  const f = await learnerFacts(l.learner_id)
  return { learner_name: f.firstName, guardian_name: l.guardian.name, minor: l.minor, share: l.share, has_email: !!l.guardian.email, has_phone: !!l.guardian.phone, locale: l.guardian.locale }
}

export async function acceptInvite(input: { token: string; decision: 'accept' | 'decline'; code?: string | null; attest?: boolean; email?: boolean; whatsapp?: boolean }): Promise<LinkStatus> {
  const l = await linkByToken(input.token)
  if (!l || !l.invite) throw new GuardianError('guardian_invite_invalid', 404)
  const col = await links()
  if (input.decision === 'decline') {
    await col.updateOne({ id: l.id, status: 'invited' }, { $set: { status: 'declined', invite: null, updated_at: nowIso() } })
    return 'declined'
  }
  if (l.minor) {
    if (!input.attest) throw new GuardianError('guardian_attest_required')
    if (l.invite.code_attempts >= MAX_CODE_ATTEMPTS) throw new GuardianError('guardian_code_locked', 429)
    const ok = !!input.code && /^\d{6}$/.test(input.code) && !!l.invite.code_hash && safeEq(sha(`${input.token}:${input.code}`), l.invite.code_hash)
    if (!ok) {
      await col.updateOne({ id: l.id }, { $inc: { 'invite.code_attempts': 1 } })
      throw new GuardianError('guardian_code_wrong')
    }
  }
  const email = !!input.email && !!l.guardian.email
  const whatsapp = !!input.whatsapp && !!l.guardian.phone
  if (!email && !whatsapp) throw new GuardianError('guardian_channel_required')
  const at = nowIso()
  const r = await col.updateOne(
    { id: l.id, status: 'invited' },
    { $set: { status: 'active', invite: null, channels: { email, whatsapp }, guardian_consent: { at, email, whatsapp, text: GUARDIAN_CONSENT_TEXT }, verification: { at, method: l.minor ? 'link_code_attest' : 'link' }, updated_at: at } },
  )
  if (!r.modifiedCount) throw new GuardianError('guardian_invite_invalid', 404)
  logger.info(`[guardian] link ${l.id} accepted`)
  return 'active'
}

/** One-click unsubscribe from the email footer (stops every channel; the learner sees "unsubscribed"). */
export async function unsubscribeGuardian(linkId: string, token: string): Promise<boolean> {
  if (typeof linkId !== 'string' || !/^[A-Za-z0-9_-]{6,40}$/.test(linkId) || typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) return false
  if (!safeEq(await unsubscribeToken(linkId), token)) return false
  await (await links()).updateOne({ id: linkId, status: { $in: ['active', 'invited'] } }, { $set: { status: 'unsubscribed', invite: null, channels: { email: false, whatsapp: false }, updated_at: nowIso() } })
  return true
}

// ─── Weekly summary ─────────────────────────────────────────────────────────

/** Gather the aggregates for one learner's week (read-only). */
export async function summaryFor(learnerId: string, share: ShareSettings, week: { start: string; end: string }, now = new Date()): Promise<GuardianSummary> {
  const d = await db()
  const from = `${week.start}T00:00:00.000Z`
  const to = new Date(Date.parse(`${week.end}T00:00:00.000Z`) + 86_400_000).toISOString()
  const trendFrom = new Date(Date.parse(from) - 28 * 86_400_000).toISOString()

  const plan = await d.collection('study_plans').findOne({ user_id: learnerId }, { projection: { week: 1 } }).catch(() => null) as { week?: { items?: { minutes?: number; done_at?: string | null; day?: string }[] } } | null
  const items = plan?.week?.items || []
  const doneThisWeek = items.filter((i) => i.done_at && i.done_at >= from && i.done_at < to)
  const planMinutesDone = doneThisWeek.reduce((a, i) => a + (Number(i.minutes) || 0), 0)
  const inWeekItems = items.filter((i) => typeof i.day === 'string' && i.day >= week.start && i.day <= week.end)

  const [waAnswers, acceptedSubmissions, subs, drivesRows] = await Promise.all([
    d.collection('wa_practice_deliveries').countDocuments({ user_id: learnerId, answered_at: { $gte: from, $lt: to } }).catch(() => 0),
    d.collection('submissions').countDocuments({ user_id: learnerId, status: 'accepted', created_at: { $gte: from, $lt: to } }).catch(() => 0),
    // Released results only; aggregates (score / max) — never answers or proctoring data.
    d.collection('exam_submissions').find(
      { user_id: learnerId, submitted_at: { $gte: trendFrom, $lt: to }, $or: [{ score_released: true }, { released_at: { $exists: true, $ne: null } }] },
      { projection: { _id: 0, exam_id: 1, score: 1, max_score: 1, submitted_at: 1 } },
    ).limit(100).toArray().catch(() => [] as Record<string, unknown>[]),
    d.collection('live_drive_candidates').find({ user_id: learnerId }, { projection: { _id: 0, drive_id: 1 } }).limit(50).toArray().catch(() => [] as Record<string, unknown>[]),
  ])
  const examIds = [...new Set(subs.map((s) => String(s.exam_id)))]
  const exams = examIds.length ? await d.collection('exams').find({ id: { $in: examIds } }, { projection: { _id: 0, id: 1, title: 1 } }).toArray() : []
  const titles = new Map(exams.map((e) => [String(e.id), String(e.title || 'Test')]))
  const driveIds = drivesRows.map((r) => String(r.drive_id))
  const horizon = new Date(now.getTime() + 30 * 86_400_000).toISOString()
  const drives = driveIds.length
    ? await d.collection('live_drives').find({ id: { $in: driveIds }, 'schedule.start_at': { $gte: now.toISOString(), $lte: horizon }, status: { $nin: ['cancelled', 'draft'] } }, { projection: { _id: 0, title: 1, schedule: 1 } }).toArray()
    : []
  const { getUserStreak } = await import('@/lib/activity-streak')
  const streak = await getUserStreak(learnerId).catch(() => ({ current: 0, longest: 0 }))

  return buildGuardianSummary({
    week,
    share,
    planMinutesDone,
    waAnswers,
    acceptedSubmissions,
    tests: subs.map((s) => ({ title: titles.get(String(s.exam_id)) || 'Test', score: Number(s.score) || 0, max_score: Number(s.max_score) || 0, at: String(s.submitted_at) })),
    streak: { current: streak.current, longest: streak.longest },
    plan: inWeekItems.length ? { planned: inWeekItems.length, done: inWeekItems.filter((i) => !!i.done_at).length } : null,
    drives: drives.map((x) => ({ title: String(x.title || ''), start_at: String((x.schedule as { start_at?: string } | undefined)?.start_at || '') })).filter((x) => x.start_at),
  })
}

/** What the guardian would get this week — shown to the learner before anything is sent. */
export async function previewForLearner(userId: string, linkId: string, now = new Date()): Promise<{ summary: GuardianSummary; lines: string[] }> {
  const l = (await (await links()).findOne({ id: linkId, learner_id: userId, status: { $in: ['invited', 'active'] } }, { projection: { _id: 0 } })) as GuardianLink | null
  if (!l) throw new GuardianError('guardian_not_found', 404)
  const due = reportDue(now, l.timezone, null)
  const summary = await summaryFor(userId, l.share, { start: due.start, end: due.end }, now)
  return { summary, lines: summaryLines(summary, l.guardian.locale) }
}

async function claimSend(linkId: string, week: string, channel: 'email' | 'whatsapp'): Promise<boolean> {
  try {
    await (await db()).collection('guardian_report_log').insertOne({ link_id: linkId, week, channel, at: nowIso() })
    return true
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return false
    throw e
  }
}

/** Hourly: send each active link's weekly report once per ISO week (Sunday evening, learner's time zone). */
export async function runGuardianReports(now = new Date(), opts: { budgetMs?: number } = {}): Promise<{ checked: number; sent: number; deferred?: number }> {
  const col = await links()
  // AUTO-082: only links due now (per timezone in use), streamed with a time budget instead of a 5,000-row cap.
  // Rows left past the budget stay unclaimed and are picked up by the next hourly run (due = hour >= report hour).
  const timezones = (await col.distinct('timezone', { status: 'active' })) as Array<string | null>
  const cursor = col.find(dueLinkFilter(timezones.length ? timezones : [null], now) as never, { projection: { _id: 0 } }).sort({ id: 1 })
  const deadline = Date.now() + (opts.budgetMs ?? 15 * 60_000)
  let sent = 0
  let checked = 0
  let deferred = 0
  for await (const doc of cursor) {
    const l = doc as unknown as GuardianLink
    if (Date.now() > deadline) { deferred++; continue }
    checked++
    const due = reportDue(now, l.timezone, l.last_report_week)
    if (!due.due) continue
    const claimed = await col.updateOne({ id: l.id, status: 'active', last_report_week: { $ne: due.week } }, { $set: { last_report_week: due.week, last_report_at: now.toISOString() } })
    if (!claimed.modifiedCount) continue
    try {
      const summary = await summaryFor(l.learner_id, l.share, { start: due.start, end: due.end }, now)
      if (summary.empty) continue
      const { firstName } = await learnerFacts(l.learner_id)
      if (l.channels.email && l.guardian.email && (await claimSend(l.id, due.week, 'email'))) {
        const unsub = await unsubscribeUrl(l.id)
        const msg = renderGuardianEmail(summary, l.guardian.locale, { learnerName: firstName, unsubscribeUrl: unsub })
        const { sendEmail } = await import('@/lib/send-email')
        const r = await sendEmail(l.guardian.email, { subject: msg.subject, html: msg.html }, undefined, {
          category: 'guardian',
          text: msg.text,
          headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        })
        if (r.success || r.queued) sent++
      }
      if (l.channels.whatsapp && l.guardian.phone && l.guardian_consent?.whatsapp && (await claimSend(l.id, due.week, 'whatsapp'))) {
        if (!(await isWhatsAppOptedOut(l.guardian.phone, l.guardian_consent.at))) {
          const { sendLocalizedTemplate } = await import('@/lib/wa-practice/transport')
          const r = await sendLocalizedTemplate(l.guardian.phone, {
            name: 'cs_guardian_weekly',
            locale: l.guardian.locale,
            params: guardianTemplateParams(summary, firstName),
            preview: summaryLines(summary, l.guardian.locale).join(' · ').slice(0, 900),
          })
          if (r.ok) sent++
          else logger.warn(`[guardian] WhatsApp report failed for ${l.id}: ${redactString(String(r.error || ''))}`)
        }
      }
    } catch (e) {
      logger.warn(`[guardian] report failed for ${l.id}: ${redactString((e as Error).message)}`)
    }
  }
  if (deferred) logger.warn(`[guardian] time budget reached: ${deferred} due reports left for the next run`)
  return { checked, sent, ...(deferred ? { deferred } : {}) }
}

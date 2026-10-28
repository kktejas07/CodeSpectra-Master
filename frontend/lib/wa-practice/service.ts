/**
 * WhatsApp-first practice (service).
 *
 * Double opt-in: (1) the learner turns it on in the app (Settings → WhatsApp practice) with an
 * explicit consent checkbox, (2) we send the approved opt-in template to that phone and only a
 * reply from the phone itself ("Yes, join" button or JOIN) activates it. STOP (any time, also
 * the platform-wide keyword handler) stops it; START resumes it.
 *
 * Daily: at the learner's local hour (never in quiet hours, once per local day, within the
 * per-user daily cap) one approved bank question of their domain + level. Outside Meta's 24 h
 * window that is a template with a "Get question" button; inside it, the question itself as
 * reply buttons / a list. Replies are graded at once with the shared grader + explanation;
 * correct answers earn XP and every answer counts for the app streak. Once a week (mock day)
 * a 5-question mini mock with a link to the study plan.
 *
 * Logs carry ids only — never phone numbers, answers or message text.
 */
import 'server-only'
import { randomBytes } from 'crypto'
import { logger } from '@/lib/logger'
import { getMongoDb } from '@/lib/mongodb'
import { redactString } from '@/lib/log-redact'
import { outboundT } from '@/lib/i18n/outbound'
import { toLocale, type Locale } from '@/lib/i18n/config'
import { getAppOrigin } from '@/lib/app-origin'
import { phoneKey, isWhatsAppOptedOut } from '@/lib/whatsapp-send'
import { toE164 } from '@/lib/ats/phone'
import {
  canResendOptin, duePrompt, dueEnrollmentFilter, gradeReply, inSession, isoWeekKey, localDayOf, matchDomain, parseCommand, questionFilter,
  questionOptions, questionsLeftToday, renderQuestion, sendHourAllowed, PRACTICE_LEVELS,
  type PracticeLevel, type PracticeQuestion, type PracticeSettings, type WaPracticeDelivery, type WaPracticeEnrollment,
} from './logic'
import { deliveriesCol, enrollmentsCol, getPracticeSettings, recordPracticeDay } from './store'
import { sendLocalizedTemplate, waTransport } from './transport'

export class PracticeError extends Error {
  constructor(public code: string, public status = 400, public params?: Record<string, string | number>) {
    super(code)
  }
}

const nowIso = () => new Date().toISOString()
const newId = () => randomBytes(9).toString('base64url')
const tFor = (locale: Locale) => outboundT('notify', locale)
const planLink = () => `${getAppOrigin()}/dashboard/study-plan`

/** Consent wording shown next to the checkbox (stored with the enrollment as given). */
export const PRACTICE_CONSENT_TEXT =
  'I agree to receive daily practice questions, results and weekly mock tests from CodeSpectra on WhatsApp at this number. I can reply STOP at any time.'

// ─── App side ───────────────────────────────────────────────────────────────

export interface EnrollInput {
  phone: string
  phone_country?: string
  domain: string
  level: PracticeLevel
  locale: Locale
  send_hour: number
  timezone: string
  daily_cap?: number
  consent: boolean
}

export interface EnrollmentView {
  status: WaPracticeEnrollment['status'] | 'none'
  phone_masked: string | null
  domain: string | null
  level: PracticeLevel | null
  locale: Locale | null
  send_hour: number | null
  timezone: string | null
  daily_cap: number | null
  confirmed_at: string | null
  consent_at: string | null
  stats: { answered: number; correct: number; xp: number }
  can_resend: boolean
}

const mask = (e164: string) => (e164.length > 6 ? `${e164.slice(0, 3)}••••${e164.slice(-3)}` : '••••')

export function enrollmentView(e: WaPracticeEnrollment | null, now = new Date()): EnrollmentView {
  if (!e || e.status === 'revoked') {
    return { status: 'none', phone_masked: null, domain: null, level: null, locale: null, send_hour: null, timezone: null, daily_cap: null, confirmed_at: null, consent_at: null, stats: { answered: 0, correct: 0, xp: 0 }, can_resend: false }
  }
  return {
    status: e.status,
    phone_masked: mask(e.phone),
    domain: e.domain,
    level: e.level,
    locale: e.locale,
    send_hour: e.send_hour,
    timezone: e.timezone,
    daily_cap: e.daily_cap,
    confirmed_at: e.confirmed?.at ?? null,
    consent_at: e.consent?.at ?? null,
    stats: e.stats || { answered: 0, correct: 0, xp: 0 },
    can_resend: e.status === 'pending' && canResendOptin(e, localDayOf(now, e.timezone)),
  }
}

export async function getEnrollment(userId: string): Promise<WaPracticeEnrollment | null> {
  return (await enrollmentsCol()).findOne({ user_id: userId }, { projection: { _id: 0 } }) as Promise<WaPracticeEnrollment | null>
}

async function domainLabel(id: string): Promise<string> {
  const { getDomain } = await import('@/lib/question-bot/store')
  return (await getDomain(id).catch(() => null))?.label || id
}

/** Turn practice on / change preferences. A new phone (or a first enrollment) restarts the double opt-in. */
export async function enroll(userId: string, input: EnrollInput, now = new Date()): Promise<WaPracticeEnrollment> {
  const s = await getPracticeSettings()
  if (!s.enabled) throw new PracticeError('wa_practice_disabled', 403)
  if (!input.consent) throw new PracticeError('wa_practice_consent_required')
  const phone = toE164(input.phone, input.phone_country || 'IN')
  const key = phone ? phoneKey(phone) : null
  if (!phone || !key) throw new PracticeError('wa_practice_invalid_phone')
  if (!sendHourAllowed(input.send_hour, s)) throw new PracticeError('wa_practice_quiet_hour', 400, { start: s.quiet_start_hour, end: s.quiet_end_hour })
  const { getDomain } = await import('@/lib/question-bot/store')
  const dom = await getDomain(input.domain)
  if (!dom || !dom.active) throw new PracticeError('wa_practice_unknown_domain')
  const cap = Math.min(s.max_daily_cap, Math.max(1, input.daily_cap ?? s.default_daily_cap))

  const col = await enrollmentsCol()
  const clash = await col.findOne({ phone_key: key, user_id: { $ne: userId }, status: { $in: ['pending', 'active', 'stopped'] } }, { projection: { id: 1 } })
  if (clash) throw new PracticeError('wa_practice_phone_in_use', 409)

  const existing = await getEnrollment(userId)
  const at = now.toISOString()
  const prefs = { domain: dom.id, level: input.level, locale: input.locale, send_hour: input.send_hour, timezone: input.timezone, daily_cap: cap, updated_at: at }
  const consent = { text: PRACTICE_CONSENT_TEXT, at, via: 'app' as const, locale: input.locale }
  const samePhone = existing && existing.phone_key === key && existing.status !== 'revoked'
  if (samePhone) {
    // Preferences only; the opt-in already given (or still pending) stays.
    await col.updateOne({ id: existing.id }, { $set: { ...prefs, consent } })
    const next = { ...existing, ...prefs, consent }
    if (existing.status === 'pending') await sendOptin(next, now).catch(() => undefined)
    return next
  }
  const doc: WaPracticeEnrollment = {
    id: existing?.id || newId(),
    user_id: userId,
    phone,
    phone_key: key,
    status: 'pending',
    ...prefs,
    consent,
    confirmed: null,
    optin_sent: null,
    stopped_at: null,
    stopped_via: null,
    last_inbound_at: null,
    last_daily_day: null,
    last_mock_week: null,
    day_count: null,
    mock: null,
    stats: existing?.stats || { answered: 0, correct: 0, xp: 0 },
    created_at: existing?.created_at || at,
    updated_at: at,
  }
  try {
    await col.replaceOne({ user_id: userId }, doc, { upsert: true })
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new PracticeError('wa_practice_phone_in_use', 409)
    throw e
  }
  await sendOptin(doc, now)
  return doc
}

/** Send (or resend) the opt-in template. Capped per local day. */
export async function sendOptin(e: WaPracticeEnrollment, now = new Date()): Promise<void> {
  const day = localDayOf(now, e.timezone)
  if (!canResendOptin(e, day)) throw new PracticeError('wa_practice_resend_limit', 429)
  const col = await enrollmentsCol()
  const count = e.optin_sent?.day === day ? e.optin_sent.count + 1 : 1
  await col.updateOne({ id: e.id }, { $set: { optin_sent: { day, count, at: now.toISOString() } } })
  const s = await getPracticeSettings()
  const t = tFor(e.locale)
  const label = await domainLabel(e.domain)
  const r = await sendLocalizedTemplate(e.phone, {
    name: s.templates.optin,
    locale: e.locale,
    params: [label],
    quickReplyPayloads: ['wp:join', 'wp:no'],
    preview: t('waPractice.optinPreview', { domain: label }),
  })
  if (!r.ok) {
    logger.warn(`[wa-practice] opt-in send failed for enrollment ${e.id}: ${redactString(String(r.error || ''))}`)
    throw new PracticeError('wa_practice_send_failed', 502)
  }
}

export async function resendOptin(userId: string, now = new Date()): Promise<void> {
  const e = await getEnrollment(userId)
  if (!e || e.status !== 'pending') throw new PracticeError('wa_practice_not_pending', 409)
  await sendOptin(e, now)
}

/** Pause from the app (same effect as STOP; START on WhatsApp or "Turn on" resumes). */
export async function stopFromApp(userId: string): Promise<void> {
  await (await enrollmentsCol()).updateOne({ user_id: userId, status: { $in: ['pending', 'active'] } }, { $set: { status: 'stopped', stopped_at: nowIso(), stopped_via: 'app', mock: null, updated_at: nowIso() } })
}

/** Resume from the app: only an enrollment the phone already confirmed (else the opt-in starts again). */
export async function resumeFromApp(userId: string): Promise<WaPracticeEnrollment> {
  const e = await getEnrollment(userId)
  if (!e || e.status !== 'stopped') throw new PracticeError('wa_practice_not_stopped', 409)
  const col = await enrollmentsCol()
  if (!e.confirmed || e.stopped_via === 'keyword') {
    // A STOP from the phone wins until the phone itself opts in again.
    await col.updateOne({ id: e.id }, { $set: { status: 'pending', consent: { ...(e.consent || { text: PRACTICE_CONSENT_TEXT, via: 'app', locale: e.locale }), at: nowIso() }, updated_at: nowIso() } })
    const next = (await getEnrollment(userId))!
    await sendOptin(next).catch(() => undefined)
    return next
  }
  await col.updateOne({ id: e.id }, { $set: { status: 'active', stopped_at: null, stopped_via: null, updated_at: nowIso() } })
  return (await getEnrollment(userId))!
}

/** Turn off and forget the number + practice history. */
export async function deleteEnrollment(userId: string): Promise<void> {
  const e = await getEnrollment(userId)
  if (!e) return
  await (await deliveriesCol()).deleteMany({ enrollment_id: e.id })
  await (await enrollmentsCol()).deleteOne({ id: e.id })
}

// ─── Sending (inside the 24 h window) ───────────────────────────────────────

async function sendText(e: WaPracticeEnrollment, text: string, opts: { afterStop?: boolean } = {}): Promise<boolean> {
  if (!opts.afterStop && (await isWhatsAppOptedOut(e.phone, e.confirmed?.at ?? e.consent?.at ?? null))) return false
  const r = await (await waTransport()).sendText(e.phone, text)
  if (!r.ok) logger.warn(`[wa-practice] text send failed for enrollment ${e.id}: ${redactString(String(r.error || ''))}`)
  return r.ok
}

async function sendButtons(e: WaPracticeEnrollment, text: string, buttons: { id: string; title: string }[]): Promise<boolean> {
  if (await isWhatsAppOptedOut(e.phone, e.confirmed?.at ?? e.consent?.at ?? null)) return false
  const r = await (await waTransport()).sendButtons(e.phone, text, buttons)
  if (!r.ok) logger.warn(`[wa-practice] buttons send failed for enrollment ${e.id}: ${redactString(String(r.error || ''))}`)
  return r.ok
}

/** Reserve `n` questions of today's cap (atomic). False = cap used up. */
async function reserve(e: WaPracticeEnrollment, day: string, n: number): Promise<boolean> {
  const r = await (await enrollmentsCol()).updateOne(
    { id: e.id, $or: [{ 'day_count.day': { $ne: day } }, { 'day_count.count': { $lte: e.daily_cap - n } }] },
    [{ $set: { day_count: { $cond: [{ $eq: ['$day_count.day', day] }, { day, count: { $add: ['$day_count.count', n] } }, { day, count: n }] } } }],
  )
  return r.modifiedCount === 1
}

async function recentQuestionIds(e: WaPracticeEnrollment): Promise<string[]> {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const rows = await (await deliveriesCol()).find({ enrollment_id: e.id, sent_at: { $gte: since } }, { projection: { question_id: 1 } }).sort({ sent_at: -1 }).limit(500).toArray()
  return rows.map((r) => r.question_id)
}

async function pickQuestions(e: WaPracticeEnrollment, n: number): Promise<PracticeQuestion[]> {
  const { questionBank } = await import('@/lib/question-bank')
  const { getDomain } = await import('@/lib/question-bot/store')
  const dom = await getDomain(e.domain).catch(() => null)
  const col = await questionBank()
  const project = { $project: { _id: 0, id: 1, type: 1, question: 1, options: 1, answer: 1, explanation: 1, tolerance: 1 } }
  const exclude = await recentQuestionIds(e)
  let rows = await col.aggregate<PracticeQuestion>([{ $match: questionFilter(e, dom, exclude) }, { $sample: { size: n } }, project]).toArray()
  if (rows.length < n) {
    // Ran out of new ones: allow repeats rather than send nothing.
    const more = await col.aggregate<PracticeQuestion>([{ $match: questionFilter(e, dom) }, { $sample: { size: n * 2 } }, project]).toArray()
    const have = new Set(rows.map((r) => r.id))
    rows = [...rows, ...more.filter((r) => !have.has(r.id))].slice(0, n)
  }
  return rows
}

async function loadQuestion(id: string): Promise<PracticeQuestion | null> {
  const { questionBank } = await import('@/lib/question-bank')
  return (await (await questionBank()).findOne({ id }, { projection: { _id: 0, id: 1, type: 1, question: 1, options: 1, answer: 1, explanation: 1, tolerance: 1 } })) as PracticeQuestion | null
}

const levelLabel = (t: ReturnType<typeof tFor>, l: PracticeLevel) => t(`waPractice.level.${l}`)

async function sendQuestion(e: WaPracticeEnrollment, q: PracticeQuestion, kind: WaPracticeDelivery['kind'], now: Date, mock?: { id: string; index: number; total: number }): Promise<boolean> {
  const t = tFor(e.locale)
  const options = questionOptions(q)
  const d: WaPracticeDelivery & { sent_date: Date } = {
    id: newId(),
    enrollment_id: e.id,
    user_id: e.user_id,
    question_id: q.id,
    kind,
    mock_id: mock?.id ?? null,
    mock_index: mock?.index ?? null,
    options,
    local_day: localDayOf(now, e.timezone),
    sent_at: now.toISOString(),
    sent_date: now,
    answered_at: null,
    correct: null,
  }
  const header = mock
    ? t('waPractice.mockHeader', { n: mock.index + 1, total: mock.total })
    : t('waPractice.questionHeader', { domain: await domainLabel(e.domain), level: levelLabel(t, e.level) })
  const view = renderQuestion(q, d.id, options, { header, replyHint: t('waPractice.replyHint'), choose: t('waPractice.choose') })
  if (await isWhatsAppOptedOut(e.phone, e.confirmed?.at ?? null)) return false
  await (await deliveriesCol()).insertOne(d)
  const tr = await waTransport()
  const r = view.mode === 'buttons' ? await tr.sendButtons(e.phone, view.body, view.buttons)
    : view.mode === 'list' ? await tr.sendList(e.phone, view.body, view.buttonLabel, view.rows)
      : await tr.sendText(e.phone, view.body)
  if (!r.ok) {
    logger.warn(`[wa-practice] question send failed for enrollment ${e.id}: ${redactString(String(r.error || ''))}`)
    await (await deliveriesCol()).deleteOne({ id: d.id })
  }
  return r.ok
}

/** The open (unanswered, < 24 h old) question, if any. */
async function openDelivery(e: WaPracticeEnrollment, now: Date): Promise<WaPracticeDelivery | null> {
  return (await (await deliveriesCol()).findOne(
    { enrollment_id: e.id, answered_at: null, sent_at: { $gte: new Date(now.getTime() - 24 * 3600_000).toISOString() } },
    { sort: { sent_at: -1 }, projection: { _id: 0 } },
  )) as WaPracticeDelivery | null
}

/** Daily / extra question now (inside the session). */
async function giveQuestion(e: WaPracticeEnrollment, now: Date): Promise<void> {
  const t = tFor(e.locale)
  const open = await openDelivery(e, now)
  if (open && !open.mock_id) {
    const q = await loadQuestion(open.question_id)
    if (q) {
      // Re-show the unanswered one instead of spending the cap.
      await (await deliveriesCol()).deleteOne({ id: open.id })
      await sendQuestion(e, q, open.kind, now)
      return
    }
  }
  const day = localDayOf(now, e.timezone)
  if (!(await reserve(e, day, 1))) {
    await sendText(e, t('waPractice.capReached', { cap: e.daily_cap, link: planLink() }))
    return
  }
  const [q] = await pickQuestions(e, 1)
  if (!q) {
    await (await enrollmentsCol()).updateOne({ id: e.id, 'day_count.day': day }, { $inc: { 'day_count.count': -1 } })
    await sendText(e, t('waPractice.noQuestion'))
    return
  }
  const first = e.day_count?.day !== day
  await sendQuestion(e, q, first ? 'daily' : 'extra', now)
}

async function startMock(e: WaPracticeEnrollment, now: Date, s: PracticeSettings): Promise<void> {
  const t = tFor(e.locale)
  const day = localDayOf(now, e.timezone)
  if (!(await reserve(e, day, s.mock_size))) {
    await sendText(e, t('waPractice.capReached', { cap: e.daily_cap, link: planLink() }))
    return
  }
  const qs = await pickQuestions(e, s.mock_size)
  if (qs.length < Math.min(3, s.mock_size)) {
    await (await enrollmentsCol()).updateOne({ id: e.id, 'day_count.day': day }, { $inc: { 'day_count.count': -s.mock_size } })
    await sendText(e, t('waPractice.noQuestion'))
    return
  }
  const mock = { id: newId(), question_ids: qs.map((q) => q.id), index: 0, correct: 0, started_at: now.toISOString() }
  await (await enrollmentsCol()).updateOne({ id: e.id }, { $set: { mock, last_mock_week: isoWeekKey(day) } })
  await sendText(e, t('waPractice.mockIntro', { count: qs.length }))
  await sendQuestion({ ...e, mock }, qs[0], 'mock', now, { id: mock.id, index: 0, total: qs.length })
}

// ─── Answers ────────────────────────────────────────────────────────────────

async function handleAnswer(e: WaPracticeEnrollment, cmd: { deliveryId: string | null; optionIndex: number | null; text: string }, now: Date, s: PracticeSettings): Promise<void> {
  const t = tFor(e.locale)
  const deliveries = await deliveriesCol()
  const d = cmd.deliveryId
    ? ((await deliveries.findOne({ id: cmd.deliveryId, enrollment_id: e.id }, { projection: { _id: 0 } })) as WaPracticeDelivery | null)
    : await openDelivery(e, now)
  if (!d) {
    await sendButtons(e, t('waPractice.noOpenQuestion'), [{ id: 'wp:next', title: t('waPractice.nextButton') }])
    return
  }
  if (d.answered_at) {
    await sendText(e, t('waPractice.alreadyAnswered'))
    return
  }
  const q = await loadQuestion(d.question_id)
  if (!q) {
    await deliveries.deleteOne({ id: d.id })
    await sendText(e, t('waPractice.noQuestion'))
    return
  }
  const g = gradeReply(q, d.options, { optionIndex: cmd.optionIndex, text: cmd.text })
  if (!g) {
    await sendText(e, d.options.length >= 2 ? t('waPractice.unclearChoice') : t('waPractice.unclearText'))
    return
  }
  // Claim the answer (a redelivered / double tap is graded once).
  const claimed = await deliveries.updateOne({ id: d.id, answered_at: null }, { $set: { answered_at: now.toISOString(), correct: g.correct } })
  if (!claimed.modifiedCount) return

  let xp = 0
  if (g.correct && s.xp_correct > 0) {
    const { awardXpWithLevelUp } = await import('@/lib/xp-service')
    const r = await awardXpWithLevelUp({ userId: e.user_id, amount: s.xp_correct, reason: 'challenge_completed', submissionId: `wa-practice:${d.id}`, metadata: { source: 'whatsapp_practice', kind: d.kind }, quiet: true }).catch(() => null)
    if (r?.xpEventId) xp = s.xp_correct
  }
  await recordPracticeDay(e.user_id, now, 'whatsapp_practice').catch(() => undefined)
  await (await enrollmentsCol()).updateOne({ id: e.id }, { $inc: { 'stats.answered': 1, 'stats.correct': g.correct ? 1 : 0, 'stats.xp': xp } })
  const { getUserStreak } = await import('@/lib/activity-streak')
  const streak = await getUserStreak(e.user_id).then((r) => r.current).catch(() => 0)

  const lines = [g.correct ? t('waPractice.correct') : t('waPractice.incorrect', { answer: g.correctAnswer.slice(0, 200) })]
  if (q.explanation) lines.push(t('waPractice.explanation', { text: String(q.explanation).slice(0, 600) }))
  const extra = [xp ? t('waPractice.xp', { xp }) : '', streak ? t('waPractice.streak', { count: streak }) : ''].filter(Boolean).join(' · ')
  if (extra) lines.push(extra)

  // Weekly mock: next question, or the result.
  if (d.mock_id && e.mock && e.mock.id === d.mock_id) {
    const correct = e.mock.correct + (g.correct ? 1 : 0)
    const index = e.mock.index + 1
    const total = e.mock.question_ids.length
    if (index < total) {
      await (await enrollmentsCol()).updateOne({ id: e.id, 'mock.id': d.mock_id }, { $set: { 'mock.index': index, 'mock.correct': correct } })
      await sendText(e, lines.join('\n\n'))
      const next = await loadQuestion(e.mock.question_ids[index])
      if (next) await sendQuestion(e, next, 'mock', now, { id: d.mock_id, index, total })
      return
    }
    await (await enrollmentsCol()).updateOne({ id: e.id, 'mock.id': d.mock_id }, { $set: { mock: null } })
    let bonus = 0
    if (s.xp_mock_complete > 0) {
      const { awardXpWithLevelUp } = await import('@/lib/xp-service')
      const r = await awardXpWithLevelUp({ userId: e.user_id, amount: s.xp_mock_complete, reason: 'challenge_completed', submissionId: `wa-mock:${d.mock_id}`, metadata: { source: 'whatsapp_practice', kind: 'mock', correct, total }, quiet: true }).catch(() => null)
      if (r?.xpEventId) bonus = s.xp_mock_complete
    }
    if (bonus) await (await enrollmentsCol()).updateOne({ id: e.id }, { $inc: { 'stats.xp': bonus } })
    lines.push(t('waPractice.mockDone', { correct, total, link: planLink() }))
    if (bonus) lines.push(t('waPractice.xp', { xp: bonus }))
    await sendText(e, lines.join('\n\n'))
    return
  }
  lines.push(t('waPractice.planLink', { link: planLink() }))
  const fresh = (await getEnrollment(e.user_id)) || e
  const left = questionsLeftToday(fresh, localDayOf(now, e.timezone))
  if (left > 0) await sendButtons(e, lines.join('\n\n'), [{ id: 'wp:next', title: t('waPractice.nextButton') }])
  else await sendText(e, lines.join('\n\n'))
}

// ─── Inbound (webhook) ──────────────────────────────────────────────────────

export interface PracticeInbound { id: string; from: string; text?: string | null; replyId?: string | null; at?: string }

/**
 * One inbound WhatsApp message (app/api/ats/screening/webhooks/whatsapp claims it once as
 * `wa:practice:<id>`). Phones without a practice enrollment are ignored. Throws on DB errors
 * so Meta redelivers.
 */
export async function handlePracticeInbound(m: PracticeInbound, opts: { skip?: boolean; now?: Date } = {}): Promise<'handled' | 'ignored'> {
  if (opts.skip) return 'ignored'
  const now = opts.now || new Date()
  const key = phoneKey(m.from.startsWith('+') ? m.from : `+${m.from}`)
  if (!key) return 'ignored'
  const col = await enrollmentsCol()
  const e = (await col.findOne({ phone_key: key, status: { $in: ['pending', 'active', 'stopped'] } }, { projection: { _id: 0 } })) as WaPracticeEnrollment | null
  if (!e) return 'ignored'
  const s = await getPracticeSettings()

  // Per-phone inbound rate limit: beyond it we stay silent (no reply storms, no cost).
  const { rateLimitRedis } = await import('@/lib/upstash-rate-limit')
  const rl = await rateLimitRedis(`wa-practice:in:${e.id}`, s.inbound_per_10min, 10 * 60_000).catch(() => ({ ok: true }))
  if (!rl.ok) return 'ignored'

  const at = m.at || now.toISOString()
  await col.updateOne({ id: e.id }, { $set: { last_inbound_at: at } })
  const cur: WaPracticeEnrollment = { ...e, last_inbound_at: at }
  const t = tFor(cur.locale)
  const cmd = parseCommand({ text: m.text, replyId: m.replyId })

  if (cmd.kind === 'stop') {
    if (cur.status === 'stopped') return 'handled'
    await col.updateOne({ id: e.id }, { $set: { status: cur.status === 'pending' ? 'revoked' : 'stopped', stopped_at: at, stopped_via: 'keyword', mock: null, updated_at: nowIso() } })
    // One confirmation after STOP is allowed.
    await sendText(cur, t('waPractice.stopped'), { afterStop: true }).catch(() => undefined)
    logger.info(`[wa-practice] enrollment ${e.id} stopped by keyword`)
    return 'handled'
  }

  if (cur.status === 'pending') {
    if (cmd.kind === 'join' || cmd.kind === 'start') {
      if (!cur.consent) return 'ignored'
      await col.updateOne({ id: e.id, status: 'pending' }, { $set: { status: 'active', confirmed: { at, via: m.replyId ? 'button' : 'text' }, updated_at: nowIso() } })
      const active: WaPracticeEnrollment = { ...cur, status: 'active', confirmed: { at, via: m.replyId ? 'button' : 'text' } }
      await sendButtons(active, `${t('waPractice.confirmed', { hour: String(cur.send_hour).padStart(2, '0') + ':00' })}\n\n${t('waPractice.help')}`, [{ id: 'wp:get', title: t('waPractice.getButton') }])
      logger.info(`[wa-practice] enrollment ${e.id} confirmed`)
      // AUTO-088: WhatsApp practice turned on (double opt-in done). No phone number in the payload.
      void import('@/lib/automation/events').then(({ emit }) => emit('wa_practice.enrolled', {
        user_id: cur.user_id, enrollment_id: cur.id, domain: cur.domain, level: cur.level, send_hour: cur.send_hour, timezone: cur.timezone,
      }, { idempotencyKey: `wa_practice.enrolled:${cur.id}:${at}` })).catch(() => {})
      return 'handled'
    }
    if (cmd.kind === 'decline') {
      await col.updateOne({ id: e.id }, { $set: { status: 'revoked', consent: null, updated_at: nowIso() } })
      await sendText(cur, t('waPractice.declined'), { afterStop: true }).catch(() => undefined)
      return 'handled'
    }
    return 'ignored'
  }

  if (cur.status === 'stopped') {
    if ((cmd.kind === 'start' || cmd.kind === 'join') && cur.confirmed) {
      // START from the phone is an explicit opt-in newer than the STOP.
      await col.updateOne({ id: e.id }, { $set: { status: 'active', stopped_at: null, stopped_via: null, confirmed: { at, via: 'text' }, updated_at: nowIso() } })
      await sendText({ ...cur, status: 'active', confirmed: { at, via: 'text' } }, t('waPractice.started'))
      return 'handled'
    }
    return 'ignored'
  }

  // Active.
  switch (cmd.kind) {
    case 'start':
    case 'join':
    case 'help':
      await sendText(cur, t('waPractice.help'))
      return 'handled'
    case 'decline':
      return 'handled'
    case 'lang': {
      const l = cmd.locale ? toLocale(cmd.locale) : null
      if (!l) { await sendText(cur, t('waPractice.langAsk')); return 'handled' }
      await col.updateOne({ id: e.id }, { $set: { locale: l, updated_at: nowIso() } })
      await sendText({ ...cur, locale: l }, tFor(l)('waPractice.langSet'))
      return 'handled'
    }
    case 'level': {
      if (!cmd.level) {
        await sendButtons(cur, t('waPractice.levelAsk'), PRACTICE_LEVELS.map((l) => ({ id: `wp:l:${l}`, title: levelLabel(t, l) })))
        return 'handled'
      }
      await col.updateOne({ id: e.id }, { $set: { level: cmd.level, updated_at: nowIso() } })
      await sendText(cur, t('waPractice.levelSet', { level: levelLabel(t, cmd.level) }))
      return 'handled'
    }
    case 'topic':
    case 'topic_pick': {
      const { listDomains } = await import('@/lib/question-bot/store')
      const domains = await listDomains({ activeOnly: true })
      const id = cmd.kind === 'topic_pick' ? (domains.some((d) => d.id === cmd.domain) ? cmd.domain : null) : cmd.query ? matchDomain(cmd.query, domains) : null
      if (!id) {
        if (cmd.kind === 'topic' && cmd.query) await sendText(cur, t('waPractice.topicNotFound'))
        const rows = domains.slice(0, 10).map((d) => ({ id: `wp:t:${d.id}`, title: d.label.slice(0, 24) }))
        const r = await (await waTransport()).sendList(cur.phone, t('waPractice.topicAsk'), t('waPractice.topicButton'), rows)
        if (!r.ok) logger.warn(`[wa-practice] topic list failed for enrollment ${e.id}`)
        return 'handled'
      }
      await col.updateOne({ id: e.id }, { $set: { domain: id, mock: null, updated_at: nowIso() } })
      await sendText(cur, t('waPractice.topicSet', { domain: domains.find((d) => d.id === id)?.label || id }))
      return 'handled'
    }
    case 'get':
    case 'next':
      if (cur.mock) {
        const next = await loadQuestion(cur.mock.question_ids[cur.mock.index])
        if (next) { await sendQuestion(cur, next, 'mock', now, { id: cur.mock.id, index: cur.mock.index, total: cur.mock.question_ids.length }); return 'handled' }
      }
      await giveQuestion(cur, now)
      return 'handled'
    case 'mock':
      if (cur.mock) { await sendText(cur, t('waPractice.mockInProgress')); return 'handled' }
      await startMock(cur, now, s)
      return 'handled'
    case 'answer':
      await handleAnswer(cur, cmd, now, s)
      return 'handled'
  }
  return 'ignored'
}

// ─── Hourly tick (lib/scheduler.ts) ─────────────────────────────────────────

/**
 * At each learner's hour: the daily prompt (or the weekly mock on mock day). Claimed per
 * enrollment + local day (`last_daily_day`), so a retry or a second worker never double-sends.
 */
export async function runPracticeTick(now = new Date(), opts: { budgetMs?: number } = {}): Promise<{ checked: number; sent: number; deferred?: number }> {
  const s = await getPracticeSettings()
  if (!s.enabled) return { checked: 0, sent: 0 }
  const col = await enrollmentsCol()
  // AUTO-082: read only rows whose local send hour is now (every timezone in use), streamed with a
  // time budget — no fixed row cap. Rows left when the budget runs out are logged, never silently dropped.
  const timezones = (await col.distinct('timezone', { status: 'active', confirmed: { $ne: null } })) as Array<string | null>
  const cursor = col.find(dueEnrollmentFilter(timezones.length ? timezones : [null], now) as never, { projection: { _id: 0 } }).sort({ id: 1 })
  const deadline = Date.now() + (opts.budgetMs ?? 12 * 60_000)
  let sent = 0
  let checked = 0
  let deferred = 0
  const users = (await getMongoDb()).collection('user')
  for await (const doc of cursor) {
    const e = doc as unknown as WaPracticeEnrollment
    if (Date.now() > deadline) { deferred++; continue }
    checked++
    const due = duePrompt(e, now, s)
    if (!due) continue
    const claimed = await col.updateOne({ id: e.id, status: 'active', last_daily_day: { $ne: due.day } }, { $set: { last_daily_day: due.day } })
    if (!claimed.modifiedCount) continue
    try {
      // AUTO-085: never message a phone whose account is gone (the purge also deletes the row).
      if (!(await users.countDocuments({ $or: [{ id: e.user_id }, { _id: e.user_id as never }] }, { limit: 1 }))) {
        await col.updateOne({ id: e.id }, { $set: { status: 'revoked' } as never })
        continue
      }
      if (await isWhatsAppOptedOut(e.phone, e.confirmed?.at ?? null)) continue
      if (inSession(e.last_inbound_at, now)) {
        if (due.kind === 'mock') await startMock(e, now, s)
        else await giveQuestion(e, now)
        sent++
        continue
      }
      const t = tFor(e.locale)
      const label = await domainLabel(e.domain)
      // The learner enrolled for this daily prompt at their hour: 'subscribed' — de-duplicated per
      // enrolment + day, never capped by the shared nudge limit (AUTO-108). If it is ever held, the
      // day's claim is undone so the next run can still send it (AUTO-109).
      const { admitMessage } = await import('@/lib/messaging/budget')
      const admit = await admitMessage({ userId: e.user_id }, { class: 'subscribed', topic: 'wa-practice', object: `${e.id}:${due.day}`, source: 'wa-practice' }, now)
      if (!admit.ok) {
        if (admit.outcome === 'capped') await col.updateOne({ id: e.id, last_daily_day: due.day }, { $set: { last_daily_day: null } }).catch(() => {})
        continue
      }
      const r = due.kind === 'mock'
        ? await sendLocalizedTemplate(e.phone, { name: s.templates.mock, locale: e.locale, params: [label, String(s.mock_size)], quickReplyPayloads: ['wp:mock', 'wp:stop'], preview: t('waPractice.mockPreview', { domain: label, count: s.mock_size }) })
        : await sendLocalizedTemplate(e.phone, { name: s.templates.daily, locale: e.locale, params: [label, levelLabel(t, e.level)], quickReplyPayloads: ['wp:get', 'wp:stop'], preview: t('waPractice.dailyPreview', { domain: label }) })
      await (r.ok ? admit.commit() : admit.release())
      if (r.ok) sent++
      else logger.warn(`[wa-practice] ${due.kind} template failed for enrollment ${e.id}: ${redactString(String(r.error || ''))}`)
    } catch (err) {
      logger.warn(`[wa-practice] tick failed for enrollment ${e.id}: ${redactString((err as Error).message)}`)
    }
  }
  if (deferred) logger.warn(`[wa-practice] time budget reached: ${deferred} due enrolments not sent this hour`)
  return { checked, sent, ...(deferred ? { deferred } : {}) }
}

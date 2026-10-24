/**
 * Interview messages: candidate + panel emails (with an .ics invite), candidate
 * WhatsApp (consent only), recruiter in-app notifications. Never throws.
 * Idempotency is the caller's job (service.ts `claimSend`).
 */
import { buildIcs, googleCalendarUrl, type CalendarEvent } from '@/lib/calendar/ics'
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { mailLocale, wrapEmail } from '@/lib/ats/notify'
import { outboundT, type OutboundText, type OutboundTranslator } from '@/lib/i18n/outbound'
import type { Locale } from '@/lib/i18n/config'
import type { AtsCandidate } from '@/lib/ats/contract'
import type { AtsInterviewDoc } from './db'
import { formatInZone } from './tz'
import { PROVIDER_LABELS } from './providers/types'

export type NoticeKind = 'scheduled' | 'rescheduled' | 'cancelled' | 'reminder_24h' | 'reminder_1h'

function where(iv: AtsInterviewDoc, t: OutboundTranslator = outboundT('email', 'en')): string {
  if (iv.mode === 'f2f') {
    const l = iv.location_details
    return [l?.address || iv.location, l?.room ? t('atsMail.iv.room', { room: l.room }) : ''].filter(Boolean).join(' · ') || t('atsMail.iv.locationTbc')
  }
  return PROVIDER_LABELS[iv.provider || 'livekit']
}

export function interviewIcs(iv: AtsInterviewDoc, url: string | null): string {
  const ev: CalendarEvent = {
    uid: `ats-interview-${iv.id}@codespectra.ai`,
    title: `Interview: ${iv.job_title || 'Interview'}${iv.candidate_name ? ` — ${iv.candidate_name}` : ''}`,
    description: [
      iv.stage_name,
      iv.mode === 'virtual' && url ? `Join: ${url}` : '',
      iv.location_details?.instructions || '',
      iv.location_details?.map_url ? `Map: ${iv.location_details.map_url}` : '',
    ].filter(Boolean).join('\n'),
    location: iv.mode === 'f2f' ? where(iv) : url || undefined,
    start: iv.scheduled_at!,
    end: new Date(Date.parse(iv.scheduled_at!) + iv.duration_min * 60_000).toISOString(),
    url: url || undefined,
  }
  return buildIcs([ev], 'CodeSpectra interviews')
}

const icsAttachment = (ics: string) => [{ name: 'interview.ics', content_type: 'text/calendar', data: Buffer.from(ics, 'utf8').toString('base64') }]

function rowsHtml(rows: [string, string | null | undefined][]): string {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;margin:0 0 12px">${rows
    .filter(([, v]) => v)
    .map(([l, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${escapeHtml(l)}</td><td style="padding:4px 0">${escapeHtml(String(v))}</td></tr>`)
    .join('')}</table>`
}

async function send(to: string | null | undefined, msg: { subject: string; html: string }, ics?: string, headers?: Record<string, string>): Promise<boolean> {
  if (!to) return false
  try {
    const { sendEmail } = await import('@/lib/send-email')
    const r = await sendEmail(to, msg, undefined, { category: 'ats', ...(ics ? { attachments: icsAttachment(ics) } : {}), ...(headers ? { headers } : {}) })
    return !!r?.success
  } catch (e) {
    console.error('[ats/interviews] email failed:', (e as Error)?.message)
    return false
  }
}

/** Consent, STOP opt-outs and the official channel are enforced by lib/whatsapp-send (AUTO-060). */
async function whatsapp(candidate: Pick<AtsCandidate, 'phone' | 'consent'> | null, text: string): Promise<boolean> {
  if (!candidate?.phone || candidate.consent?.whatsapp !== true) return false
  try {
    const { sendWhatsAppToCandidate } = await import('@/lib/whatsapp-send')
    const r = await sendWhatsAppToCandidate(candidate, { kind: 'hiring', title: 'Interview update', text: text.slice(0, 1000), urgent: true })
    return r.sent === true
  } catch (e) {
    console.error('[ats/interviews] whatsapp failed:', (e as Error)?.message)
    return false
  }
}

/** How the self-schedule invite reached the candidate (CORE-053). */
export interface InviteDelivery { email: 'sent' | 'unsubscribed' | 'failed' | 'no_email'; whatsapp: boolean }

/**
 * Pure: the recruiter notice key when the "pick a time" e-mail did not go out
 * (null when it did). The recruiter can copy the link from the interview page
 * and share it another way.
 */
export function inviteNoticeKey(d: InviteDelivery): string | null {
  if (d.email === 'sent') return null
  const why = d.email === 'unsubscribed' ? 'Unsubscribed' : d.email === 'no_email' ? 'NoEmail' : 'Failed'
  return `interview.inviteNotSent${why}${d.whatsapp ? 'Wa' : ''}`
}

/**
 * SEO-033: every candidate / panel message is written in the recipient's saved
 * language (lib/i18n/recipient), from email.json `atsMail.*`. The self-schedule
 * invite reuses the hiring scheduler agent's subject, button, footer and
 * unsubscribe text (lib/agent/hiring-loops/i18n) so a candidate gets the same
 * "Pick a time" email whether the agent or a recruiter sent it.
 */
const reminderKind = (k: NoticeKind) => k === 'reminder_24h' || k === 'reminder_1h'

/** Candidate notice. `joinUrl` is the candidate's link (virtual). */
export async function noticeCandidate(iv: AtsInterviewDoc, candidate: AtsCandidate | null, kind: NoticeKind, joinUrl: string | null, company: string): Promise<void> {
  const to = candidate?.email ?? iv.candidate_email
  const locale = await mailLocale(to)
  const t = outboundT('email', locale)
  const tz = iv.timezone || 'UTC'
  const when = iv.scheduled_at ? formatInZone(iv.scheduled_at, tz, locale) : ''
  const name = candidate?.name || iv.candidate_name || t('atsMail.nameFallback')
  const role = iv.job_title || t('atsMail.roleFallback')
  const p = { name, role, company }
  const subject = t(`atsMail.iv.subject.${kind}`, p)
  const intro = t(`atsMail.iv.intro.${kind === 'cancelled' ? 'cancelled' : kind === 'rescheduled' ? 'rescheduled' : reminderKind(kind) ? 'reminder' : 'scheduled'}`, p)
  const minutes = t('atsMail.iv.minutes', { count: iv.duration_min })
  const rows: [string, string | null | undefined][] = kind === 'cancelled' ? [[t('atsMail.row.role'), role]] : [
    [t('atsMail.row.role'), role],
    [t('atsMail.row.when'), when],
    [t('atsMail.row.length'), minutes],
    [t('atsMail.row.where'), where(iv, t)],
    ...(iv.mode === 'f2f'
      ? ([[t('atsMail.row.map'), iv.location_details?.map_url], [t('atsMail.row.instructions'), iv.location_details?.instructions]] as [string, string | null | undefined][])
      : []),
  ]
  const calUrl = kind !== 'cancelled' && iv.scheduled_at
    ? googleCalendarUrl({ title: t('atsMail.iv.calendarTitle', p), start: iv.scheduled_at, end: new Date(Date.parse(iv.scheduled_at) + iv.duration_min * 60_000), location: iv.mode === 'f2f' ? where(iv, t) : joinUrl || undefined, description: joinUrl || '' })
    : null
  const body = `<p style="margin:0 0 14px">${escapeHtml(intro)}</p>${rowsHtml(rows)}${
    calUrl ? `<p style="margin:0 0 6px;font-size:13px"><a href="${escapeHtml(calUrl)}" style="color:#2F5BE7">${escapeHtml(t('atsMail.iv.calendarLink'))}</a> · ${escapeHtml(t('atsMail.iv.calendarNote'))}</p>` : ''}`
  const cta = kind !== 'cancelled' && iv.mode === 'virtual' && joinUrl ? { url: joinUrl, label: t('atsMail.iv.join') } : undefined
  const ics = kind === 'scheduled' || kind === 'rescheduled' ? interviewIcs(iv, joinUrl) : undefined
  await send(to, wrapEmail(subject, body, cta, locale), ics)

  if (kind !== 'reminder_1h') {
    const wa = kind === 'cancelled'
      ? t('atsMail.iv.wa.cancelled', p)
      : `${t(`atsMail.iv.wa.${kind}`, { ...p, when })}${iv.mode === 'virtual' && joinUrl ? `. ${t('atsMail.iv.wa.join', { url: joinUrl })}` : iv.mode === 'f2f' ? `. ${where(iv, t)}` : ''}`
    await whatsapp(candidate, wa)
  }
}

/** Self-schedule invitation with the slot-picker link (same subject / button / footer as the scheduler agent's offer). */
export async function inviteToSchedule(iv: AtsInterviewDoc, candidate: AtsCandidate, link: string, company: string): Promise<InviteDelivery> {
  const locale = await mailLocale(candidate.email)
  const t = outboundT('email', locale)
  const { hlt, hlLocale } = await import('@/lib/agent/hiring-loops/i18n')
  const hl = hlLocale(locale)
  const name = candidate.name || t('atsMail.nameFallback')
  const role = iv.job_title || t('atsMail.roleFallback')
  let email: InviteDelivery['email'] = 'no_email'
  if (candidate.email) {
    const { isUnsubscribed, unsubscribeUrl, listUnsubscribeHeaders } = await import('@/lib/automation/mailer')
    if (await isUnsubscribed(candidate.email, 'hiring').catch(() => false)) email = 'unsubscribed'
    else {
      const intro = t('atsMail.iv.inviteIntro', { name, role, company, minutes: iv.duration_min, mode: t(iv.mode === 'f2f' ? 'atsMail.iv.mode.f2f' : 'atsMail.iv.mode.video') })
      const unsub = unsubscribeUrl(candidate.email, 'hiring')
      const body = `<p style="margin:0 0 14px">${escapeHtml(intro)}</p>`
        + `<p style="margin:16px 0 0;font-size:12px;color:#6b7280">${escapeHtml(hlt(hl, 'mail.footer', { company }))}${unsub ? ` · <a href="${escapeHtml(unsub)}" style="color:#6b7280">${escapeHtml(hlt(hl, 'mail.unsubscribe'))}</a>` : ''}</p>`
      email = (await send(candidate.email, wrapEmail(hlt(hl, 'mail.subject', { role, company }), body, { url: link, label: hlt(hl, 'mail.pick') }, locale), undefined, listUnsubscribeHeaders(candidate.email, 'hiring'))) ? 'sent' : 'failed'
    }
  }
  const wa = await whatsapp(candidate, t('atsMail.iv.waInvite', { name, role, company, link }))
  return { email, whatsapp: wa }
}

/** Panel notice (each member separately, in their own language). */
export async function noticePanel(iv: AtsInterviewDoc, kind: NoticeKind, panelUrl: string, members = iv.panel): Promise<void> {
  const tz = iv.timezone || 'UTC'
  // External meetings: the provider link; built-in video: the interview page.
  const meet = iv.mode === 'virtual' && iv.provider && iv.provider !== 'livekit' ? iv.join_url || null : null
  const ics = kind === 'scheduled' || kind === 'rescheduled' ? interviewIcs(iv, meet || panelUrl) : undefined
  const byLocale = new Map<Locale, { subject: string; html: string }>()
  for (const m of members) {
    const locale = await mailLocale(m.email)
    let msg = byLocale.get(locale)
    if (!msg) {
      const t = outboundT('email', locale)
      const when = iv.scheduled_at ? formatInZone(iv.scheduled_at, tz, locale) : ''
      const subject = t(`atsMail.panel.subject.${kind}`, { candidate: iv.candidate_name || t('atsMail.candidateFallback'), role: iv.job_title || t('atsMail.interviewFallback') })
      const rows: [string, string | null | undefined][] = [
        [t('atsMail.row.candidate'), iv.candidate_name],
        [t('atsMail.row.role'), iv.job_title],
        [t('atsMail.row.stage'), iv.stage_name],
        ...(kind === 'cancelled' ? [] : ([[t('atsMail.row.when'), when], [t('atsMail.row.length'), t('atsMail.iv.minutes', { count: iv.duration_min })], [t('atsMail.row.where'), where(iv, t)], [t('atsMail.row.meeting'), meet]] as [string, string | null][])),
      ]
      const intro = t(kind === 'cancelled' ? 'atsMail.panel.introCancelled' : 'atsMail.panel.intro')
      msg = wrapEmail(subject, `<p style="margin:0 0 14px">${escapeHtml(intro)}</p>${rowsHtml(rows)}`, { url: panelUrl, label: t('atsMail.panel.open') }, locale)
      byLocale.set(locale, msg)
    }
    await send(m.email, msg, ics)
  }
}

/** In-app notification to people who schedule (job recruiters, else ATS admins/recruiters). */
export async function notifySchedulers(iv: AtsInterviewDoc, recruiterIds: string[], title: string, message: string, i18n?: { title: OutboundText; message: OutboundText }): Promise<void> {
  try {
    let ids = recruiterIds.filter(Boolean)
    if (!ids.length) {
      const { getMongoDb } = await import('@/lib/mongodb')
      const rows = await (await getMongoDb()).collection('ats_members')
        .find({ tenant_id: iv.tenant_id, status: 'active', role: { $in: ['admin', 'recruiter'] }, user_id: { $type: 'string' } }, { projection: { user_id: 1 } })
        .limit(20).toArray()
      ids = rows.map((r) => String(r.user_id))
    }
    if (!ids.length) return
    const { notifyMany } = await import('@/lib/notifications')
    await notifyMany([...new Set(ids)], {
      type: 'interview.scheduled',
      title,
      message,
      ...(i18n ? { title_i18n: i18n.title, message_i18n: i18n.message } : {}),
      link: `/dashboard/hiring/interviews/${iv.id}`,
    })
  } catch (e) {
    console.error('[ats/interviews] notify failed:', (e as Error)?.message)
  }
}

export const panelLink = (iv: Pick<AtsInterviewDoc, 'id'>) => `${getAppOrigin()}/dashboard/hiring/interviews/${encodeURIComponent(iv.id)}`

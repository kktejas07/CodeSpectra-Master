/**
 * Interview messages: candidate + panel emails (with an .ics invite), candidate
 * WhatsApp (consent only), recruiter in-app notifications. Never throws.
 * Idempotency is the caller's job (service.ts `claimSend`).
 */
import { buildIcs, googleCalendarUrl, type CalendarEvent } from '@/lib/calendar/ics'
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { wrapEmail } from '@/lib/ats/notify'
import type { AtsCandidate } from '@/lib/ats/contract'
import type { AtsInterviewDoc } from './db'
import { formatInZone } from './tz'
import { PROVIDER_LABELS } from './providers/types'

export type NoticeKind = 'scheduled' | 'rescheduled' | 'cancelled' | 'reminder_24h' | 'reminder_1h'

function where(iv: AtsInterviewDoc): string {
  if (iv.mode === 'f2f') {
    const l = iv.location_details
    return [l?.address || iv.location, l?.room ? `Room: ${l.room}` : ''].filter(Boolean).join(' · ') || 'Location to be confirmed'
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

async function send(to: string | null | undefined, msg: { subject: string; html: string }, ics?: string): Promise<boolean> {
  if (!to) return false
  try {
    const { sendEmail } = await import('@/lib/send-email')
    const r = await sendEmail(to, msg, undefined, { category: 'ats', ...(ics ? { attachments: icsAttachment(ics) } : {}) })
    return !!r?.success
  } catch (e) {
    console.error('[ats/interviews] email failed:', (e as Error)?.message)
    return false
  }
}

async function whatsapp(candidate: Pick<AtsCandidate, 'phone' | 'consent'> | null, text: string): Promise<void> {
  if (!candidate?.phone || candidate.consent?.whatsapp !== true) return
  try {
    const { sendWhatsAppText } = await import('@/lib/whatsapp')
    await sendWhatsAppText(candidate.phone, text.slice(0, 1000))
  } catch (e) {
    console.error('[ats/interviews] whatsapp failed:', (e as Error)?.message)
  }
}

const SUBJECT: Record<NoticeKind, string> = {
  scheduled: 'Interview scheduled',
  rescheduled: 'Interview rescheduled',
  cancelled: 'Interview cancelled',
  reminder_24h: 'Reminder: interview tomorrow',
  reminder_1h: 'Reminder: interview in an hour',
}

/** Candidate notice. `joinUrl` is the candidate's link (virtual). */
export async function noticeCandidate(iv: AtsInterviewDoc, candidate: AtsCandidate | null, kind: NoticeKind, joinUrl: string | null, company: string): Promise<void> {
  const tz = iv.timezone || 'UTC'
  const when = iv.scheduled_at ? formatInZone(iv.scheduled_at, tz) : ''
  const name = candidate?.name || iv.candidate_name || 'there'
  const role = iv.job_title || 'the role'
  const subject = `${SUBJECT[kind]}: ${role} at ${company}`
  const intro = kind === 'cancelled'
    ? `Hi ${name}, your interview for ${role} at ${company} has been cancelled. The hiring team will contact you about next steps.`
    : `Hi ${name}, ${kind === 'rescheduled' ? 'your interview has a new time' : kind.startsWith('reminder') ? 'this is a reminder of your interview' : `your interview for ${role} at ${company} is booked`}.`
  const rows: [string, string | null | undefined][] = kind === 'cancelled' ? [['Role', role]] : [
    ['Role', role],
    ['When', when],
    ['Length', `${iv.duration_min} minutes`],
    ['Where', where(iv)],
    ...(iv.mode === 'f2f'
      ? ([['Map', iv.location_details?.map_url], ['Instructions', iv.location_details?.instructions]] as [string, string | null | undefined][])
      : []),
  ]
  const calUrl = kind !== 'cancelled' && iv.scheduled_at
    ? googleCalendarUrl({ title: `Interview: ${role} at ${company}`, start: iv.scheduled_at, end: new Date(Date.parse(iv.scheduled_at) + iv.duration_min * 60_000), location: iv.mode === 'f2f' ? where(iv) : joinUrl || undefined, description: joinUrl || '' })
    : null
  const body = `<p style="margin:0 0 14px">${escapeHtml(intro)}</p>${rowsHtml(rows)}${
    calUrl ? `<p style="margin:0 0 6px;font-size:13px"><a href="${escapeHtml(calUrl)}" style="color:#2F5BE7">Add to Google Calendar</a> · the attached .ics works with Outlook and Apple Calendar.</p>` : ''}`
  const cta = kind !== 'cancelled' && iv.mode === 'virtual' && joinUrl ? { url: joinUrl, label: 'Join interview' } : undefined
  const ics = kind === 'scheduled' || kind === 'rescheduled' ? interviewIcs(iv, joinUrl) : undefined
  await send(candidate?.email ?? iv.candidate_email, wrapEmail(subject, body, cta), ics)

  if (kind !== 'reminder_1h') {
    const wa = kind === 'cancelled'
      ? `Hi ${name}, your interview for ${role} at ${company} has been cancelled. We'll be in touch.`
      : `Hi ${name}, ${SUBJECT[kind].toLowerCase()} for ${role} at ${company}: ${when}${iv.mode === 'virtual' && joinUrl ? `. Join: ${joinUrl}` : iv.mode === 'f2f' ? `. ${where(iv)}` : ''}`
    await whatsapp(candidate, wa)
  }
}

/** Self-schedule invitation with the slot-picker link. */
export async function inviteToSchedule(iv: AtsInterviewDoc, candidate: AtsCandidate, link: string, company: string): Promise<void> {
  const role = iv.job_title || 'the role'
  const subject = `Pick a time for your ${role} interview at ${company}`
  const body = `<p style="margin:0 0 14px">${escapeHtml(`Hi ${candidate.name || 'there'}, you're invited to a ${iv.duration_min}-minute ${iv.mode === 'f2f' ? 'in-person' : 'video'} interview for ${role} at ${company}. Choose a time that works for you.`)}</p>`
  await send(candidate.email, wrapEmail(subject, body, { url: link, label: 'Choose a time' }))
  await whatsapp(candidate, `Hi ${candidate.name || 'there'}, please pick a time for your ${role} interview at ${company}: ${link}`)
}

/** Panel notice (each member separately). */
export async function noticePanel(iv: AtsInterviewDoc, kind: NoticeKind, panelUrl: string, members = iv.panel): Promise<void> {
  const tz = iv.timezone || 'UTC'
  const when = iv.scheduled_at ? formatInZone(iv.scheduled_at, tz) : ''
  const subject = `${SUBJECT[kind]}: ${iv.candidate_name || 'candidate'} — ${iv.job_title || 'interview'}`
  // External meetings: the provider link; built-in video: the interview page.
  const meet = iv.mode === 'virtual' && iv.provider && iv.provider !== 'livekit' ? iv.join_url || null : null
  const rows: [string, string | null | undefined][] = [
    ['Candidate', iv.candidate_name],
    ['Role', iv.job_title],
    ['Stage', iv.stage_name],
    ...(kind === 'cancelled' ? [] : ([['When', when], ['Length', `${iv.duration_min} minutes`], ['Where', where(iv)], ['Meeting link', meet]] as [string, string | null][])),
  ]
  const intro = kind === 'cancelled' ? 'This interview was cancelled.' : 'Open the interview page to read the résumé, join the meeting and submit your scorecard.'
  const html = wrapEmail(subject, `<p style="margin:0 0 14px">${escapeHtml(intro)}</p>${rowsHtml(rows)}`, { url: panelUrl, label: 'Open interview' })
  const ics = kind === 'scheduled' || kind === 'rescheduled' ? interviewIcs(iv, meet || panelUrl) : undefined
  for (const m of members) await send(m.email, html, ics)
}

/** In-app notification to people who schedule (job recruiters, else ATS admins/recruiters). */
export async function notifySchedulers(iv: AtsInterviewDoc, recruiterIds: string[], title: string, message: string): Promise<void> {
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
      link: `/dashboard/hiring/interviews/${iv.id}`,
    })
  } catch (e) {
    console.error('[ats/interviews] notify failed:', (e as Error)?.message)
  }
}

export const panelLink = (iv: Pick<AtsInterviewDoc, 'id'>) => `${getAppOrigin()}/dashboard/hiring/interviews/${encodeURIComponent(iv.id)}`

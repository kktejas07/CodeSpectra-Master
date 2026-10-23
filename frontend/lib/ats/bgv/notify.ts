/**
 * BGV messages. Candidate: invite, reminder, more-info request, US pre-adverse
 * and final adverse notices (email; WhatsApp only for invite / reminder and
 * only with consent on record). Hiring team: in-app notifications. Never
 * throws. Idempotency is the caller's job (service.ts claimSend).
 */
import { escapeHtml } from '@/lib/safe-html'
import { mailLocale, textToHtml, wrapEmail } from '@/lib/ats/notify'
import { outboundT } from '@/lib/i18n/outbound'
import { formatDate } from '@/lib/i18n/format'
import type { AtsCandidate } from '@/lib/ats/contract'
import { CHECK_LABEL, REGION_LABELS, SUMMARY_OF_RIGHTS_PLACEHOLDER } from './catalog'
import type { BgvCaseDoc } from './types'

const STATUS_WORDS: Record<string, string> = {
  not_started: 'Not started', submitted: 'Submitted', in_progress: 'In progress', verified: 'Verified',
  discrepancy: 'Discrepancy found', unable_to_verify: 'Unable to verify', waived: 'Not required',
}

async function send(to: string | null | undefined, msg: { subject: string; html: string }, attachments?: { name: string; content_type: string; data: string }[]): Promise<boolean> {
  if (!to) return false
  try {
    const { sendEmail } = await import('@/lib/send-email')
    const r = await sendEmail(to, msg, undefined, { category: 'ats', ...(attachments ? { attachments } : {}) })
    return !!r?.success
  } catch (e) {
    console.error('[ats/bgv] email failed:', (e as Error)?.message)
    return false
  }
}

/** Consent, STOP opt-outs and the official channel are enforced by lib/whatsapp-send (AUTO-060). */
async function whatsapp(candidate: Pick<AtsCandidate, 'phone' | 'consent'> | null, text: string): Promise<void> {
  if (!candidate?.phone || candidate.consent?.whatsapp !== true) return
  try {
    const { sendWhatsAppToCandidate } = await import('@/lib/whatsapp-send')
    await sendWhatsAppToCandidate(candidate, { kind: 'hiring', title: 'Background verification', text: text.slice(0, 1000) })
  } catch (e) {
    console.error('[ats/bgv] whatsapp failed:', (e as Error)?.message)
  }
}

const p = (t: string) => `<p style="margin:0 0 14px">${escapeHtml(t)}</p>`

// SEO-033: candidate emails in the candidate's saved language (email.json `atsMail.bgv.*`).
// The attached report summary and summary of rights stay in English (legal text).

export async function sendInvite(c: BgvCaseDoc, candidate: AtsCandidate | null, link: string, company: string, kind: 'invite' | 'reminder' | 'resend'): Promise<boolean> {
  const to = c.candidate_email ?? candidate?.email
  const locale = await mailLocale(to)
  const t = outboundT('email', locale)
  const name = c.candidate_name || t('atsMail.nameFallback')
  const deadline = c.deadline ? formatDate(locale, c.deadline, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null
  const v = { name, role: c.job_title, company, region: REGION_LABELS[c.region], link }
  const subject = t(kind === 'reminder' ? 'atsMail.bgv.subject.reminder' : 'atsMail.bgv.subject.invite', v)
  const body = [
    p(t('atsMail.greeting', v)),
    p(t(kind === 'reminder' ? 'atsMail.bgv.reminderBody' : 'atsMail.bgv.inviteBody', v)),
    deadline ? p(t('atsMail.bgv.deadline', { date: deadline })) : '',
    p(t('atsMail.bgv.personal')),
  ].join('')
  const ok = await send(to, wrapEmail(subject, body, { url: link, label: t(kind === 'reminder' ? 'atsMail.bgv.ctaContinue' : 'atsMail.bgv.ctaStart') }, locale))
  await whatsapp(candidate, t(kind === 'reminder' ? 'atsMail.bgv.waReminder' : 'atsMail.bgv.waInvite', v))
  return ok
}

export async function sendInfoRequest(c: BgvCaseDoc, link: string, company: string, checkLabel: string, message: string): Promise<boolean> {
  const locale = await mailLocale(c.candidate_email)
  const t = outboundT('email', locale)
  const subject = t('atsMail.bgv.infoSubject', { check: checkLabel })
  const body = p(t('atsMail.bgv.infoBody', { name: c.candidate_name || t('atsMail.nameFallback'), company, check: checkLabel })) +
    `<blockquote style="margin:0 0 14px;padding:8px 14px;border-left:3px solid #2F5BE7;color:#374151">${textToHtml(message)}</blockquote>`
  return send(c.candidate_email, wrapEmail(subject, body, { url: link, label: t('atsMail.bgv.infoCta') }, locale))
}

/** Plain-text copy of the verification results (attached to adverse-action notices). */
export function reportText(c: BgvCaseDoc, company: string): string {
  const lines = [
    `Background verification summary — ${c.candidate_name}`,
    `Employer: ${company}`,
    `Role: ${c.job_title}`,
    `Region: ${REGION_LABELS[c.region]}`,
    c.vendor !== 'manual' ? `Consumer reporting agency / vendor: ${c.vendor}${c.vendor_report_ref ? ` (report ${c.vendor_report_ref})` : ''}` : 'Verified by the employer (no consumer reporting agency)',
    '',
    // Only the vendor's neutral finding is quoted — internal verifier notes never leave the hiring team.
    ...c.checks.map((k) => `- ${CHECK_LABEL(c.region, k.type)}: ${STATUS_WORDS[k.status] || k.status}${(k.status === 'discrepancy' || k.status === 'unable_to_verify') && k.vendor_notes ? ` — ${k.vendor_notes}` : ''}`),
  ]
  return lines.join('\n')
}

const attach = (name: string, text: string) => [{ name, content_type: 'text/plain', data: Buffer.from(text, 'utf8').toString('base64') }]

export async function sendPreAdverse(c: BgvCaseDoc, company: string, finalOn: string): Promise<boolean> {
  const locale = await mailLocale(c.candidate_email)
  const t = outboundT('email', locale)
  const v = { role: c.job_title, company, date: finalOn }
  const subject = t('atsMail.bgv.preAdverse.subject', v)
  const text = [
    t('atsMail.dear', { name: c.candidate_name || t('atsMail.candidateFallback') }),
    t(c.vendor === 'checkr' ? 'atsMail.bgv.preAdverse.p1Checkr' : 'atsMail.bgv.preAdverse.p1', v),
    t('atsMail.bgv.preAdverse.p2', v),
    SUMMARY_OF_RIGHTS_PLACEHOLDER,
  ].join('\n\n')
  return send(c.candidate_email, wrapEmail(subject, textToHtml(text), undefined, locale), [...attach('background-check-summary.txt', reportText(c, company)), ...attach('summary-of-rights.txt', SUMMARY_OF_RIGHTS_PLACEHOLDER)])
}

export async function sendFinalAdverse(c: BgvCaseDoc, company: string): Promise<boolean> {
  const locale = await mailLocale(c.candidate_email)
  const t = outboundT('email', locale)
  const v = { role: c.job_title, company, vendor: c.vendor }
  const subject = t('atsMail.bgv.adverse.subject', v)
  const text = [
    t('atsMail.dear', { name: c.candidate_name || t('atsMail.candidateFallback') }),
    t('atsMail.bgv.adverse.p1', v),
    t(c.vendor !== 'manual' ? 'atsMail.bgv.adverse.vendor' : 'atsMail.bgv.adverse.manual', v),
    SUMMARY_OF_RIGHTS_PLACEHOLDER,
  ].join('\n\n')
  return send(c.candidate_email, wrapEmail(subject, textToHtml(text), undefined, locale), attach('summary-of-rights.txt', SUMMARY_OF_RIGHTS_PLACEHOLDER))
}

/** In-app notification to the job's recruiters (else the tenant's ATS admins / recruiters). */
export async function notifyTeam(c: Pick<BgvCaseDoc, 'tenant_id' | 'candidate_id' | 'application_id'>, recruiterIds: string[], title: string, message: string): Promise<void> {
  try {
    let ids = recruiterIds.filter(Boolean)
    if (!ids.length) {
      const { getMongoDb } = await import('@/lib/mongodb')
      const rows = await (await getMongoDb()).collection('ats_members')
        .find({ tenant_id: c.tenant_id, status: 'active', role: { $in: ['admin', 'recruiter'] }, user_id: { $type: 'string' } }, { projection: { user_id: 1 } })
        .limit(20).toArray()
      ids = rows.map((r) => String(r.user_id))
    }
    if (!ids.length) return
    const { notifyMany } = await import('@/lib/notifications')
    await notifyMany([...new Set(ids)], { type: 'ats.bgv', title, message, link: `/dashboard/hiring/candidates/${c.candidate_id}?app=${c.application_id}` })
  } catch (e) {
    console.error('[ats/bgv] notify failed:', (e as Error)?.message)
  }
}

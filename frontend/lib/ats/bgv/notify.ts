/**
 * BGV messages. Candidate: invite, reminder, more-info request, US pre-adverse
 * and final adverse notices (email; WhatsApp only for invite / reminder and
 * only with consent on record). Hiring team: in-app notifications. Never
 * throws. Idempotency is the caller's job (service.ts claimSend).
 */
import { escapeHtml } from '@/lib/safe-html'
import { textToHtml, wrapEmail } from '@/lib/ats/notify'
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

async function whatsapp(candidate: Pick<AtsCandidate, 'phone' | 'consent'> | null, text: string): Promise<void> {
  if (!candidate?.phone || candidate.consent?.whatsapp !== true) return
  try {
    const { sendWhatsAppText } = await import('@/lib/whatsapp')
    await sendWhatsAppText(candidate.phone, text.slice(0, 1000))
  } catch (e) {
    console.error('[ats/bgv] whatsapp failed:', (e as Error)?.message)
  }
}

const p = (t: string) => `<p style="margin:0 0 14px">${escapeHtml(t)}</p>`

export async function sendInvite(c: BgvCaseDoc, candidate: AtsCandidate | null, link: string, company: string, kind: 'invite' | 'reminder' | 'resend'): Promise<boolean> {
  const name = c.candidate_name || 'there'
  const deadline = c.deadline ? new Date(c.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null
  const subject = kind === 'reminder'
    ? `Reminder: complete your background verification for ${c.job_title}`
    : `Background verification for ${c.job_title} at ${company}`
  const body = [
    p(`Hi ${name},`),
    p(kind === 'reminder'
      ? `Your background verification for ${c.job_title} at ${company} isn't finished yet.`
      : `As the next step for ${c.job_title} at ${company}, please complete a background verification (${REGION_LABELS[c.region]}). You'll review a consent notice first, then fill in a few details and upload documents. You can save and come back any time.`),
    deadline ? p(`Please finish by ${deadline}.`) : '',
    p('This link is personal — please do not forward it.'),
  ].join('')
  const ok = await send(c.candidate_email ?? candidate?.email, wrapEmail(subject, body, { url: link, label: kind === 'reminder' ? 'Continue verification' : 'Start verification' }))
  await whatsapp(candidate, `Hi ${name}, ${kind === 'reminder' ? 'a reminder to complete' : 'please complete'} your background verification for ${c.job_title} at ${company}: ${link}`)
  return ok
}

export async function sendInfoRequest(c: BgvCaseDoc, link: string, company: string, checkLabel: string, message: string): Promise<boolean> {
  const subject = `More information needed: ${checkLabel}`
  const body = p(`Hi ${c.candidate_name || 'there'}, the ${company} hiring team needs a little more for your ${checkLabel} check:`) +
    `<blockquote style="margin:0 0 14px;padding:8px 14px;border-left:3px solid #2F5BE7;color:#374151">${textToHtml(message)}</blockquote>`
  return send(c.candidate_email, wrapEmail(subject, body, { url: link, label: 'Update my details' }))
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
  const subject = `Pre-adverse action notice — ${c.job_title} at ${company}`
  const text = [
    `Dear ${c.candidate_name || 'candidate'},`,
    `${company} is considering a decision not to proceed with your application for ${c.job_title} based in whole or in part on information in your background check. A copy of the report summary is attached${c.vendor === 'checkr' ? ', and the consumer reporting agency (Checkr) provides the full report' : ''}, together with a summary of your rights.`,
    `No final decision has been made. If any information is inaccurate or incomplete, or you want to give us context, please reply to this email before ${finalOn}. You may also dispute the report directly with the consumer reporting agency.`,
    SUMMARY_OF_RIGHTS_PLACEHOLDER,
  ].join('\n\n')
  return send(c.candidate_email, wrapEmail(subject, textToHtml(text)), [...attach('background-check-summary.txt', reportText(c, company)), ...attach('summary-of-rights.txt', SUMMARY_OF_RIGHTS_PLACEHOLDER)])
}

export async function sendFinalAdverse(c: BgvCaseDoc, company: string): Promise<boolean> {
  const subject = `Adverse action notice — ${c.job_title} at ${company}`
  const text = [
    `Dear ${c.candidate_name || 'candidate'},`,
    `After reviewing your background check and any information you sent us, ${company} has decided not to proceed with your application for ${c.job_title}.`,
    c.vendor !== 'manual'
      ? `The consumer reporting agency (${c.vendor}) did not make this decision and cannot explain why it was made. You have the right to a free copy of your report from the agency within 60 days, and to dispute the accuracy or completeness of any information in it with the agency.`
      : 'You may ask us for a copy of the verification results and dispute anything you believe is inaccurate.',
    SUMMARY_OF_RIGHTS_PLACEHOLDER,
  ].join('\n\n')
  return send(c.candidate_email, wrapEmail(subject, textToHtml(text)), attach('summary-of-rights.txt', SUMMARY_OF_RIGHTS_PLACEHOLDER))
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

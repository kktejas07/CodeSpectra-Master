/**
 * Candidate / client messages for stage changes. Called by the engine once per
 * stage entry (the engine's ledger makes these idempotent). Email always
 * escapes tenant- and candidate-supplied text; WhatsApp only with consent.
 */
import { escapeHtml } from '@/lib/safe-html'
import type { AtsApplication, AtsCandidate, AtsJob, PipelineStage } from './contract'

export const DEFAULT_REJECTION = {
  subject: 'Your application for {{job_title}}',
  body:
    'Hi {{candidate_name}},\n\nThank you for your interest in the {{job_title}} role at {{company}} and for the time you spent on your application.\n\nAfter careful review we have decided not to move forward with your application at this time. We will keep your details on file and may reach out about future roles that fit your experience.\n\nWe wish you the very best in your search.\n\n{{company}} hiring team',
}

export const DEFAULT_OFFER = {
  subject: 'Offer: {{job_title}} at {{company}}',
  body:
    'Hi {{candidate_name}},\n\nWe are delighted to offer you the {{job_title}} role at {{company}}.\n\n{{offer_summary}}\n\nOur team will be in touch with the formal offer letter and next steps. Reply to this email if you have any questions.\n\n{{company}} hiring team',
}

export type TemplateVars = Record<string, string | number | null | undefined>

/** Replace {{var}} in a plain-text template. Pure; unknown vars become empty. */
export function renderText(tpl: string, vars: TemplateVars): string {
  return String(tpl || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => {
    const v = vars[k.toLowerCase()]
    return v === null || v === undefined ? '' : String(v)
  })
}

/** Plain text → safe HTML paragraphs (everything escaped). Pure. */
export function textToHtml(text: string): string {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

/** Minimal branded wrapper; `bodyHtml` must already be safe. */
export function wrapEmail(subject: string, bodyHtml: string, cta?: { url: string; label: string }): { subject: string; html: string } {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#2F5BE7;color:#ffffff;padding:11px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : ''
  return {
    subject: subject.replace(/[\r\n]+/g, ' ').slice(0, 200),
    html: `<div style="background:#f3f4f6;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;color:#111827;font-size:15px;line-height:1.7">
<h1 style="font-size:19px;margin:0 0 16px;font-weight:700">${escapeHtml(subject)}</h1>${bodyHtml}${button}
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">Sent through CodeSpectra hiring.</p></div></div>`,
  }
}

function salaryLine(job: AtsJob): string {
  const s = job.salary
  if (!s || (s.min === undefined && s.max === undefined)) return ''
  const cur = s.currency || ''
  const per = s.period ? ` per ${s.period}` : ''
  const fmt = (n?: number) => (n === undefined ? '' : n.toLocaleString('en-IN'))
  const range = s.min !== undefined && s.max !== undefined ? `${fmt(s.min)} – ${fmt(s.max)}` : fmt(s.min ?? s.max)
  return `Compensation: ${cur} ${range}${per}`.replace(/\s+/g, ' ').trim()
}

export function offerSummary(job: AtsJob, stage: PipelineStage): string {
  const lines = [
    `Role: ${job.title}`,
    job.location ? `Location: ${job.location}${job.work_mode ? ` (${job.work_mode})` : ''}` : job.work_mode ? `Work mode: ${job.work_mode}` : '',
    job.employment_type ? `Employment: ${job.employment_type.replace('_', ' ')}` : '',
    salaryLine(job),
    stage.config?.kind === 'offer' && stage.config.template ? stage.config.template : '',
  ]
  return lines.filter(Boolean).join('\n')
}

async function companyName(job: AtsJob): Promise<string> {
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    if (job.client_id) {
      const c = await db.collection('ats_clients').findOne({ id: job.client_id, tenant_id: job.tenant_id }, { projection: { name: 1 } })
      if (c?.name) return String(c.name)
    }
    const t = await db.collection('tenants').findOne({ id: job.tenant_id }, { projection: { name: 1 } })
    return t?.name ? String(t.name) : 'our company'
  } catch {
    return 'our company'
  }
}

async function tenantTemplate(tenantId: string, key: 'rejection_email' | 'offer_email') {
  try {
    const { atsSettings } = await import('./db')
    const doc = await (await atsSettings()).findOne({ tenant_id: tenantId })
    const t = doc?.[key]
    return t && typeof t.subject === 'string' && typeof t.body === 'string' && t.body.trim() ? t : null
  } catch {
    return null
  }
}

async function send(to: string | null, msg: { subject: string; html: string }): Promise<boolean> {
  if (!to) return false
  try {
    const { sendEmail } = await import('@/lib/send-email')
    const r = await sendEmail(to, msg, undefined, { category: 'ats' })
    return !!r?.success
  } catch (e) {
    console.error('[ats/notify] email failed:', (e as Error)?.message)
    return false
  }
}

async function whatsapp(candidate: AtsCandidate, text: string): Promise<void> {
  // Consent is a hard gate: no message without an explicit opt-in on record.
  if (!candidate.phone || candidate.consent?.whatsapp !== true) return
  try {
    const { sendWhatsAppText } = await import('@/lib/whatsapp')
    await sendWhatsAppText(candidate.phone, text.slice(0, 1000))
  } catch (e) {
    console.error('[ats/notify] whatsapp failed:', (e as Error)?.message)
  }
}

/** Messages for one stage entry. Never throws. */
export async function notifyStageEntry(ctx: {
  app: AtsApplication
  job: AtsJob
  candidate: AtsCandidate
  stage: PipelineStage
}): Promise<void> {
  const { job, candidate, stage } = ctx
  const notify = stage.notify || {}
  const company = await companyName(job)
  const vars: TemplateVars = {
    candidate_name: candidate.name || 'there',
    job_title: job.title,
    company,
    stage_name: stage.name,
  }
  try {
    if (stage.type === 'rejected') {
      if (notify.email !== false) {
        const t = (await tenantTemplate(job.tenant_id, 'rejection_email')) || DEFAULT_REJECTION
        await send(candidate.email, wrapEmail(renderText(t.subject, vars), textToHtml(renderText(t.body, vars))))
      }
      return // no WhatsApp/client pings for rejections
    }
    if (stage.type === 'offer') {
      if (notify.email !== false) {
        const t = (await tenantTemplate(job.tenant_id, 'offer_email')) || DEFAULT_OFFER
        const v = { ...vars, offer_summary: offerSummary(job, stage) }
        await send(candidate.email, wrapEmail(renderText(t.subject, v), textToHtml(renderText(t.body, v))))
      }
    } else if (stage.type === 'hired') {
      if (notify.email) {
        await send(candidate.email, wrapEmail(`Welcome to ${company}`, textToHtml(renderText('Hi {{candidate_name}},\n\nCongratulations — you have been hired for the {{job_title}} role. The team will contact you about onboarding.', vars))))
      }
    } else if (stage.type === 'applied') {
      if (notify.email) {
        await send(candidate.email, wrapEmail(`We received your application for ${job.title}`, textToHtml(renderText('Hi {{candidate_name}},\n\nThanks for applying to {{job_title}} at {{company}}. We will review your application and let you know about next steps.', vars))))
      }
    } else if (notify.email && !['assessment', 'bot_screen', 'virtual_interview', 'f2f_interview', 'hr_round', 'bgv'].includes(stage.type)) {
      // assessment / bot screen / interview / HR round / BGV stages contact the candidate themselves (invite, call, form or portal link).
      await send(candidate.email, wrapEmail(`Update on your ${job.title} application`, textToHtml(renderText('Hi {{candidate_name}},\n\nGood news — your application for {{job_title}} at {{company}} has moved to the next step: {{stage_name}}. We will be in touch with details shortly.', vars))))
    }

    if (notify.whatsapp) {
      await whatsapp(candidate, renderText('Hi {{candidate_name}}, your application for {{job_title}} at {{company}} moved to: {{stage_name}}.', vars))
    }

    if (notify.client && stage.client_visible && job.client_id) {
      const { getMongoDb } = await import('@/lib/mongodb')
      const client = await (await getMongoDb()).collection('ats_clients').findOne({ id: job.client_id, tenant_id: job.tenant_id })
      const contacts = (Array.isArray(client?.contacts) ? client!.contacts : []) as { email?: string; name?: string }[]
      const url = `${appUrl()}/dashboard/hiring/applications/${ctx.app.id}`
      for (const c of contacts.slice(0, 10)) {
        if (!c?.email) continue
        await send(c.email, wrapEmail(`Candidate ready for review: ${job.title}`, textToHtml(`${candidate.name} is ready for your review for the ${job.title} role (${stage.name}).`), { url, label: 'Review candidate' }))
      }
    }
  } catch (e) {
    console.error('[ats/notify] stage notification failed:', (e as Error)?.message)
  }
}

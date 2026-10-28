/**
 * Candidate / client messages for stage changes. Called by the engine once per
 * stage entry (the engine's ledger makes these idempotent). Email always
 * escapes tenant- and candidate-supplied text; WhatsApp only with consent.
 */
import { escapeHtml } from '@/lib/safe-html'
import { outboundT } from '@/lib/i18n/outbound'
import type { Locale } from '@/lib/i18n/config'
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

/** Minimal branded wrapper; `bodyHtml` must already be safe. `locale`: the recipient's language (footer + lang). */
export function wrapEmail(subject: string, bodyHtml: string, cta?: { url: string; label: string }, locale: Locale = 'en'): { subject: string; html: string } {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#2F5BE7;color:#ffffff;padding:11px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : ''
  return {
    subject: subject.replace(/[\r\n]+/g, ' ').slice(0, 200),
    html: `<div lang="${locale}" style="background:#f3f4f6;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;color:#111827;font-size:15px;line-height:1.7">
<h1 style="font-size:19px;margin:0 0 16px;font-weight:700">${escapeHtml(subject)}</h1>${bodyHtml}${button}
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">${escapeHtml(outboundT('email', locale)('atsMail.footer'))}</p></div></div>`,
  }
}

function salaryLine(job: AtsJob, locale: Locale): string {
  const s = job.salary
  if (!s || (s.min === undefined && s.max === undefined)) return ''
  const t = outboundT('email', locale)
  const cur = s.currency || ''
  const per = s.period ? ` ${t('atsMail.offer.per', { period: s.period })}` : ''
  const fmt = (n?: number) => (n === undefined ? '' : n.toLocaleString('en-IN'))
  const range = s.min !== undefined && s.max !== undefined ? `${fmt(s.min)} – ${fmt(s.max)}` : fmt(s.min ?? s.max)
  return t('atsMail.offer.compensation', { value: `${cur} ${range}${per}` }).replace(/\s+/g, ' ').trim()
}

export function offerSummary(job: AtsJob, stage: PipelineStage, locale: Locale = 'en'): string {
  const t = outboundT('email', locale)
  const lines = [
    t('atsMail.offer.role', { value: job.title }),
    job.location ? t('atsMail.offer.location', { value: `${job.location}${job.work_mode ? ` (${job.work_mode})` : ''}` }) : job.work_mode ? t('atsMail.offer.workMode', { value: job.work_mode }) : '',
    job.employment_type ? t('atsMail.offer.employment', { value: job.employment_type.replace('_', ' ') }) : '',
    salaryLine(job, locale),
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

/**
 * SEO-033: the built-in rejection / offer text in the candidate's language
 * (a tenant's own template is sent as written).
 */
async function defaultTemplate(kind: 'rejection' | 'offer', locale: Locale): Promise<{ subject: string; body: string }> {
  const fallback = kind === 'rejection' ? DEFAULT_REJECTION : DEFAULT_OFFER
  try {
    const { outboundTemplate } = await import('@/lib/i18n/outbound')
    return {
      subject: outboundTemplate('email', locale, `atsDefault.${kind}.subject`) ?? fallback.subject,
      body: outboundTemplate('email', locale, `atsDefault.${kind}.body`) ?? fallback.body,
    }
  } catch {
    return fallback
  }
}

/** The recipient's saved language (English when unknown or on any failure). */
export async function mailLocale(email: string | null | undefined): Promise<Locale> {
  try {
    const { localeForEmail } = await import('@/lib/i18n/recipient')
    return await localeForEmail(email)
  } catch {
    return 'en'
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

export type CandidateWhatsAppRoute = 'meta' | 'unofficial' | 'none'

/**
 * Which channel carries candidate WhatsApp updates (audit A-031). Pure.
 * The official Meta Cloud API whenever it is configured (same setup as bot
 * screening). The unofficial OpenWA gateway (lib/whatsapp.ts) only when the
 * platform explicitly opts in (Admin → Automations → WhatsApp, or
 * WHATSAPP_UNOFFICIAL=1 / ATS_WHATSAPP_UNOFFICIAL=1) — numbers can be banned
 * for bulk sends through it.
 */
export function candidateWhatsAppRoute(o: { metaReady: boolean; phoneNumberId: string | null; unofficialEnabled: boolean }): CandidateWhatsAppRoute {
  if (o.metaReady && o.phoneNumberId) return 'meta'
  return o.unofficialEnabled ? 'unofficial' : 'none'
}

async function whatsapp(job: AtsJob, candidate: AtsCandidate, vars: TemplateVars, text: string): Promise<void> {
  // Consent is a hard gate: no message without an explicit opt-in on record.
  if (!candidate.phone || candidate.consent?.whatsapp !== true) return
  try {
    // A STOP reply to our number wins over the consent on record (AUTO-061).
    const { isWhatsAppOptedOut, unofficialWhatsAppEnabled } = await import('@/lib/whatsapp-send')
    if (await isWhatsAppOptedOut(candidate.phone, (candidate.consent as { whatsapp_at?: string } | undefined)?.whatsapp_at ?? null)) return
    const cfgMod = await import('./screening/config')
    const { pickRegionNumbers } = await import('./screening/regions')
    const cfg = await cfgMod.getPlatformConfig()
    const tenant = await cfgMod.getTenantSettings(job.tenant_id).catch(() => null)
    const numbers = pickRegionNumbers(candidate, tenant?.regions, cfgMod.platformNumbers(cfg))
    const route = candidateWhatsAppRoute({
      metaReady: cfgMod.whatsappReady(cfg),
      phoneNumberId: numbers.whatsapp_phone_number_id,
      unofficialEnabled: await unofficialWhatsAppEnabled(),
    })
    if (route === 'none') return
    if (route === 'unofficial') {
      const { sendWhatsAppText } = await import('@/lib/whatsapp')
      await sendWhatsAppText(candidate.phone, text.slice(0, 1000))
      return
    }
    const { metaTransport } = await import('./screening/providers/whatsapp')
    const { readServerSecrets } = await import('@/lib/server-secrets-cache')
    const secrets = await readServerSecrets()
    const templateName = (secrets.meta_whatsapp_template_status || process.env.META_WHATSAPP_TEMPLATE_STATUS || 'application_status_update').trim()
    const t = metaTransport(cfg, numbers.whatsapp_phone_number_id!)
    // Business-initiated messages need an approved template; plain text only
    // reaches candidates who messaged us in the last 24 h.
    const params = [vars.candidate_name, vars.job_title, vars.company, vars.stage_name].map((v) => String(v ?? ''))
    const r = await t.sendTemplate(candidate.phone, { name: templateName, language: cfg.whatsapp.template_language, bodyParams: params }, text)
    if (!r.ok) {
      const fallback = await t.sendText(candidate.phone, text.slice(0, 1000))
      if (!fallback.ok) console.error('[ats/notify] whatsapp (meta) failed:', (r.error || '').slice(0, 160))
    }
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
  // SEO-033: candidate messages in the candidate's saved language.
  const locale = await mailLocale(candidate.email)
  const tr = outboundT('email', locale)
  const vars: TemplateVars = {
    candidate_name: candidate.name || tr('atsMail.nameFallback'),
    job_title: job.title,
    company,
    stage_name: stage.name,
  }
  const p = { name: String(vars.candidate_name), role: job.title, company, stage: stage.name }
  try {
    if (stage.type === 'rejected') {
      if (notify.email !== false) {
        const t = (await tenantTemplate(job.tenant_id, 'rejection_email')) || (await defaultTemplate('rejection', locale))
        await send(candidate.email, wrapEmail(renderText(t.subject, vars), textToHtml(renderText(t.body, vars)), undefined, locale))
      }
      return // no WhatsApp/client pings for rejections
    }
    if (stage.type === 'offer') {
      if (notify.email !== false) {
        const t = (await tenantTemplate(job.tenant_id, 'offer_email')) || (await defaultTemplate('offer', locale))
        const v = { ...vars, offer_summary: offerSummary(job, stage, locale) }
        await send(candidate.email, wrapEmail(renderText(t.subject, v), textToHtml(renderText(t.body, v)), undefined, locale))
      }
    } else if (stage.type === 'hired') {
      if (notify.email) {
        await send(candidate.email, wrapEmail(tr('atsMail.stage.hired.subject', p), textToHtml(tr('atsMail.stage.hired.body', p)), undefined, locale))
      }
    } else if (stage.type === 'applied') {
      if (notify.email) {
        await send(candidate.email, wrapEmail(tr('atsMail.stage.applied.subject', p), textToHtml(tr('atsMail.stage.applied.body', p)), undefined, locale))
      }
    } else if (notify.email && !['assessment', 'bot_screen', 'virtual_interview', 'f2f_interview', 'hr_round', 'bgv'].includes(stage.type)) {
      // assessment / bot screen / interview / HR round / BGV stages contact the candidate themselves (invite, call, form or portal link).
      await send(candidate.email, wrapEmail(tr('atsMail.stage.moved.subject', p), textToHtml(tr('atsMail.stage.moved.body', p)), undefined, locale))
    }

    if (notify.whatsapp) {
      await whatsapp(job, candidate, vars, tr('atsMail.stage.wa', p))
    }

    if (notify.client && stage.client_visible && job.client_id) {
      const { getMongoDb } = await import('@/lib/mongodb')
      const client = await (await getMongoDb()).collection('ats_clients').findOne({ id: job.client_id, tenant_id: job.tenant_id })
      const contacts = (Array.isArray(client?.contacts) ? client!.contacts : []) as { email?: string; name?: string }[]
      const url = `${appUrl()}/dashboard/hiring/applications/${ctx.app.id}`
      for (const c of contacts.slice(0, 10)) {
        if (!c?.email) continue
        const cl = await mailLocale(c.email)
        const ct = outboundT('email', cl)
        const cp = { candidate: candidate.name, role: job.title, stage: stage.name }
        await send(c.email, wrapEmail(ct('atsMail.stage.client.subject', cp), textToHtml(ct('atsMail.stage.client.body', cp)), { url, label: ct('atsMail.stage.client.cta') }, cl))
      }
    }
  } catch (e) {
    console.error('[ats/notify] stage notification failed:', (e as Error)?.message)
  }
}

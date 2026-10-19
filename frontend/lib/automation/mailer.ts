/**
 * Email for automations and workflows.
 *
 * Every message:
 *   - carries a signed one-click unsubscribe link (+ "manage preferences"),
 *   - is skipped for addresses that unsubscribed (per category or from all
 *     automated email) — billing/security notices still go out,
 *   - honours the user's email channel switch (notification preferences),
 *   - waits for the end of the user's quiet hours unless urgent,
 *   - can be made idempotent with `onceKey` (automation_sends ledger).
 * Delivery itself goes through sendEmail (suppression list + retry outbox).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { getAppOrigin } from '@/lib/app-origin'
import { escapeHtmlText } from './interpolate'
import { claimOnce, col, nowIso, releaseClaim } from './store'
import { normalizeEmail } from './outbox'

export type MailCategory = 'transactional' | 'engagement' | 'billing' | 'security' | 'hiring' | 'assessment' | 'events'

/** Categories that are account-critical: unsubscribes don't stop them (prefs link still shown). */
const CRITICAL: ReadonlySet<MailCategory> = new Set(['billing', 'security'])

export const CATEGORY_LABEL: Record<MailCategory, string> = {
  transactional: 'service emails',
  engagement: 'tips and reminders',
  billing: 'billing notices',
  security: 'security notices',
  hiring: 'hiring updates',
  assessment: 'test and results emails',
  events: 'event reminders',
}

// ─── Unsubscribe tokens ─────────────────────────────────────────────────────

function unsubscribeKey(): string {
  return process.env.AUTOMATION_LINK_SECRET || process.env.SESSION_SECRET || process.env.CRON_SECRET || 'codespectra-dev-unsubscribe'
}

export function unsubscribeToken(email: string, scope: string): string {
  return createHmac('sha256', unsubscribeKey()).update(`unsub:${email.toLowerCase()}:${scope}`).digest('base64url').slice(0, 32)
}

export function verifyUnsubscribeToken(email: string, scope: string, token: string): boolean {
  const a = Buffer.from(unsubscribeToken(email, scope))
  const b = Buffer.from(String(token || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

export function unsubscribeUrl(email: string, scope: string): string {
  const q = new URLSearchParams({ e: email.toLowerCase(), s: scope, t: unsubscribeToken(email, scope) })
  return `${getAppOrigin()}/api/automation/unsubscribe?${q.toString()}`
}

export async function isUnsubscribed(email: string, category: MailCategory): Promise<boolean> {
  if (CRITICAL.has(category)) return false
  const e = normalizeEmail(email)
  if (!e) return false
  try {
    const row = await (await col('email_unsubscribes')).findOne({ email: e, scope: { $in: ['all', category] }, active: { $ne: false } }, { projection: { _id: 1 } })
    return !!row
  } catch {
    return false
  }
}

export async function recordUnsubscribe(email: string, scope: string): Promise<void> {
  const e = normalizeEmail(email)
  if (!e) return
  await (await col('email_unsubscribes')).updateOne(
    { email: e, scope },
    { $set: { email: e, scope, active: true, updated_at: nowIso() }, $setOnInsert: { created_at: nowIso() } },
    { upsert: true },
  )
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/** Plain text → safe paragraphs (blank line = new paragraph, single newline = <br>). */
export function textToParagraphs(text: string): string {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151">${escapeHtmlText(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

function safeHref(url: string | undefined | null): string | null {
  if (!url) return null
  const u = String(url).trim()
  if (u.startsWith('/')) return `${getAppOrigin()}${u}`
  return /^https:\/\//i.test(u) || /^http:\/\/localhost(:\d+)?\//i.test(u) ? u : null
}

export interface MailContent {
  heading: string
  /** Plain text (escaped) — or pre-escaped HTML via bodyHtml. */
  bodyText?: string
  bodyHtml?: string
  cta?: { label: string; url: string } | null
  /** Why they got it, shown above the unsubscribe link. */
  reason?: string
  preheader?: string
}

export function renderAutomationEmail(content: MailContent, footer: { unsubscribeUrl: string; manageUrl: string; category: MailCategory }): string {
  const body = content.bodyHtml ?? textToParagraphs(content.bodyText || '')
  const href = content.cta ? safeHref(content.cta.url) : null
  const button = href && content.cta
    ? `<p style="margin:8px 0 4px"><a href="${escapeHtmlText(href)}" style="display:inline-block;background:#2F5BE7;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtmlText(content.cta.label || 'Open')}</a></p>`
    : ''
  const pre = content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtmlText(content.preheader)}</div>` : ''
  const reason = content.reason || `You got this email because of your CodeSpectra account.`
  return `<!doctype html><html><body style="margin:0;background:#f3f5fb">${pre}
<div style="padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1729">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e3e7f1;border-radius:16px;overflow:hidden">
    <tr><td style="background:#2F5BE7;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700">CodeSpectra</td></tr>
    <tr><td style="padding:28px">
      <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#0f1729">${escapeHtmlText(content.heading)}</h1>
      ${body}
      ${button}
    </td></tr>
    <tr><td style="padding:18px 28px;border-top:1px solid #e3e7f1;font-size:12px;line-height:1.6;color:#4b5563">
      ${escapeHtmlText(reason)}<br/>
      <a href="${escapeHtmlText(footer.manageUrl)}" style="color:#2F5BE7">Manage email preferences</a> ·
      <a href="${escapeHtmlText(footer.unsubscribeUrl)}" style="color:#2F5BE7">${CRITICAL.has(footer.category) ? 'Unsubscribe from other automated email' : `Unsubscribe from ${escapeHtmlText(CATEGORY_LABEL[footer.category])}`}</a>
    </td></tr>
  </table>
</div></body></html>`
}

// ─── Sending ────────────────────────────────────────────────────────────────

export interface AutomationMail extends MailContent {
  to: string
  subject: string
  category: MailCategory
  /** Platform user the email is about (preferences + quiet hours). Looked up by email when absent. */
  userId?: string | null
  /** Send once per key (ledger). */
  onceKey?: string
  /** Ignore quiet hours. */
  urgent?: boolean
}

export type MailOutcome = 'sent' | 'deferred' | 'queued' | 'duplicate' | 'skipped_unsubscribed' | 'skipped_preferences' | 'skipped_suppressed' | 'skipped_invalid' | 'failed'

async function userForEmail(db: Db, email: string): Promise<{ id: string } | null> {
  const u = await db.collection('user').findOne({ email }, { projection: { id: 1, _id: 1 } }).catch(() => null)
  return u ? { id: String(u.id || u._id) } : null
}

async function emailChannelOff(db: Db, userId: string): Promise<boolean> {
  const pref = await db.collection('notification_preferences').findOne({ user_id: userId, type: 'email' }, { projection: { enabled: 1 } }).catch(() => null)
  return pref?.enabled === false
}

export async function sendAutomationEmail(mail: AutomationMail): Promise<MailOutcome> {
  const to = normalizeEmail(mail.to)
  if (!to) return 'skipped_invalid'
  if (await isUnsubscribed(to, mail.category)) return 'skipped_unsubscribed'
  const db = await getMongoDb()
  const userId = mail.userId ?? (await userForEmail(db, to))?.id ?? null
  if (userId && !CRITICAL.has(mail.category) && (await emailChannelOff(db, userId))) return 'skipped_preferences'
  if (mail.onceKey && !(await claimOnce(`mail:${mail.onceKey}`, { to_hash: to.length }))) return 'duplicate'

  const html = renderAutomationEmail(mail, {
    unsubscribeUrl: unsubscribeUrl(to, CRITICAL.has(mail.category) ? 'engagement' : mail.category),
    manageUrl: `${getAppOrigin()}/dashboard/notifications/preferences`,
    category: mail.category,
  })
  const subject = mail.subject.replace(/[\r\n]+/g, ' ').slice(0, 200)

  try {
    if (userId && !mail.urgent) {
      const { deliverOrDefer } = await import('@/lib/notifications-delivery')
      const r = await deliverOrDefer(userId, { email: { to, subject, html } })
      if (r === 'deferred') return 'deferred'
      return 'sent'
    }
    const { sendEmail } = await import('@/lib/send-email')
    const r = await sendEmail(to, { subject, html }, undefined, { category: 'notification' })
    if (r.success) return 'sent'
    if (r.suppressed) return 'skipped_suppressed'
    if (r.queued) return 'queued'
    if (mail.onceKey) await releaseClaim(`mail:${mail.onceKey}`)
    return 'failed'
  } catch (e) {
    console.error('[automation/mailer] send failed:', e)
    if (mail.onceKey) await releaseClaim(`mail:${mail.onceKey}`)
    return 'failed'
  }
}

/** Every superadmin's email (ops alerts). */
export async function superadminEmails(): Promise<{ id: string; email: string }[]> {
  const db = await getMongoDb()
  const rows = await db.collection('user').find({ role: 'superadmin', email: { $type: 'string' } }, { projection: { id: 1, _id: 1, email: 1 } }).limit(50).toArray()
  return rows.map((r) => ({ id: String(r.id || r._id), email: String(r.email) }))
}

/** A tenant's admins (tenant_admin users of that organisation). */
export async function tenantAdminUsers(tenantId: string): Promise<{ id: string; email: string; name: string }[]> {
  const db = await getMongoDb()
  const rows = await db
    .collection('user')
    .find({ role: 'tenant_admin', $or: [{ tenantId }, { tenant_id: tenantId }, { organizationId: tenantId }] }, { projection: { id: 1, _id: 1, email: 1, name: 1, fullName: 1 } })
    .limit(50)
    .toArray()
  return rows.filter((r) => typeof r.email === 'string').map((r) => ({ id: String(r.id || r._id), email: String(r.email), name: String(r.fullName || r.name || '') }))
}

/**
 * Admin / ops alerts (AU-13): email to superadmins (+ extra addresses) and an
 * optional Slack / Teams incoming webhook. De-duplicated per key and hour so
 * a broken cron produces one alert, not sixty.
 */
import { safeFetch } from '@/lib/url-safety'
import { claimOnce, releaseClaim } from './store'
import { decryptValue, getSystemSettings, isAllowedChatWebhook } from './settings'
import { sendAutomationEmail, superadminEmails } from './mailer'

export interface AdminAlert {
  /** Stable id for de-duplication, e.g. 'cron-stale:ats-sla'. */
  key: string
  title: string
  detail: string
  severity: 'warning' | 'critical'
  link?: string
  /** De-dup window (default 1 hour). */
  windowMinutes?: number
}

export function alertWindowKey(key: string, now: Date, windowMinutes = 60): string {
  const bucket = Math.floor(now.getTime() / (windowMinutes * 60_000))
  return `alert:${key}:${bucket}`
}

/** Slack-compatible JSON; Teams incoming webhooks accept `text` as well. */
export function chatPayload(a: AdminAlert, appUrl: string): Record<string, unknown> {
  const icon = a.severity === 'critical' ? ':rotating_light:' : ':warning:'
  const link = a.link ? `\n<${appUrl}${a.link}|Open in CodeSpectra>` : ''
  return { text: `${icon} *${a.title}*\n${a.detail}${link}` }
}

export async function postChatWebhook(url: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
  if (!isAllowedChatWebhook(url)) throw new Error('Not a Slack/Teams incoming webhook URL')
  const timeout = AbortSignal.timeout(10_000)
  const res = await safeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([timeout, signal]) : timeout })
  if (!res.ok) throw new Error(`Webhook answered ${res.status}`)
}

/** Send one alert (no-op when the same key already alerted in this window). */
export async function sendAdminAlert(a: AdminAlert, now = new Date()): Promise<boolean> {
  const dedupe = alertWindowKey(a.key, now, a.windowMinutes)
  if (!(await claimOnce(dedupe, { kind: 'alert' }))) return false
  const { getAppOrigin } = await import('@/lib/app-origin')
  const appUrl = getAppOrigin()
  let delivered = false
  try {
    const settings = await getSystemSettings()
    const hook = await decryptValue(settings.config.alert_webhook_url)
    if (hook) {
      try {
        await postChatWebhook(hook, chatPayload(a, appUrl))
        delivered = true
      } catch (e) {
        console.error('[automation/alerts] chat webhook failed:', (e as Error).message)
      }
    }
    const admins = await superadminEmails()
    const extra = (settings.config.alert_emails || []).map((email) => ({ id: '', email }))
    const seen = new Set<string>()
    for (const r of [...admins, ...extra]) {
      if (seen.has(r.email)) continue
      seen.add(r.email)
      const out = await sendAutomationEmail({
        to: r.email,
        userId: r.id || null,
        urgent: true,
        category: 'security',
        subject: `[CodeSpectra ${a.severity === 'critical' ? 'alert' : 'warning'}] ${a.title}`,
        heading: a.title,
        bodyText: a.detail,
        cta: a.link ? { label: 'Open', url: a.link } : null,
        reason: 'You get operations alerts because you are a platform administrator.',
      })
      if (out === 'sent' || out === 'queued') delivered = true
    }
    if (admins.length) {
      const { notifyMany } = await import('@/lib/notifications')
      await notifyMany(admins.map((x) => x.id), { type: 'system.alert', title: a.title, message: a.detail.slice(0, 300), link: a.link || '/dashboard/admin/automations', icon: 'alert-triangle', skip_push: a.severity !== 'critical' })
      delivered = true
    }
  } catch (e) {
    console.error('[automation/alerts] alert failed:', e)
  }
  if (!delivered) await releaseClaim(dedupe)
  return delivered
}

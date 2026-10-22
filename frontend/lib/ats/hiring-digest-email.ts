/**
 * Weekly hiring analytics digest email, in the recipient's language
 * (lib/i18n/messages/<locale>/email.json, keys `hiringDigest.*`). Aggregate
 * numbers only — no candidate names or contact details. Every email carries a
 * one-click unsubscribe (link + List-Unsubscribe headers).
 */
import 'server-only'
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { hasOutboundKey, outboundT } from '@/lib/i18n/outbound'
import { formatDate, formatNumber } from '@/lib/i18n/format'
import type { Locale } from '@/lib/i18n/config'
import type { DigestNumbers } from './hiring-insights'

const BLUE = '#2F5BE7'

export function renderDigestEmail(locale: Locale, d: { orgName: string; numbers: DigestNumbers; range: { from: string; to: string }; unsubPath: string }): { subject: string; html: string; headers: Record<string, string> } {
  const t = outboundT('email', locale)
  const origin = getAppOrigin()
  const n = d.numbers
  const num = (v: number) => formatNumber(locale, v)
  const range = `${formatDate(locale, d.range.from, { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${formatDate(locale, new Date(Date.parse(d.range.to) - 1), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
  const rows: Array<[string, string]> = [
    [t('hiringDigest.applications'), num(n.applications)],
    [t('hiringDigest.hires'), num(n.hires)],
    [t('hiringDigest.offers'), t('hiringDigest.offersValue', { offers: num(n.offers), accepted: num(n.offers_accepted) })],
    [t('hiringDigest.timeToHire'), n.median_time_to_hire_days === null ? '—' : t('hiringDigest.days', { days: n.median_time_to_hire_days })],
    [t('hiringDigest.topSource'), n.top_source ? (hasOutboundKey('email', `hiringDigest.source.${n.top_source}`) ? t(`hiringDigest.source.${n.top_source}`) : n.top_source) : '—'],
    [t('hiringDigest.openJobs'), num(n.open_jobs)],
  ]
  const unsub = `${origin}${d.unsubPath}`
  const link = `${origin}/dashboard/hiring/analytics`
  const subject = t('hiringDigest.subject', { org: d.orgName || 'CodeSpectra', range })
  const html = `<div style="background:#f3f5fb;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
<tr><td style="background:${BLUE};padding:20px 28px;color:#ffffff;font-size:17px;font-weight:700">${escapeHtml(t('hiringDigest.heading'))}</td></tr>
<tr><td style="padding:28px;color:#0f1729;font-size:15px;line-height:1.6">
<p style="margin:0 0 16px">${escapeHtml(t('hiringDigest.intro', { org: d.orgName || 'CodeSpectra', range }))}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#475569">${escapeHtml(k)}</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${escapeHtml(v)}</td></tr>`).join('\n')}
</table>
<p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:${BLUE};color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600">${escapeHtml(t('hiringDigest.open'))}</a></p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#475569">
${escapeHtml(t('hiringDigest.why'))} <a href="${escapeHtml(unsub)}" style="color:${BLUE}">${escapeHtml(t('hiringDigest.unsubscribe'))}</a>
</td></tr></table></div>`
  return { subject, html, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }
}

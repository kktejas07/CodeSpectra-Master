/**
 * Localized text for nudge emails (pure). Every nudge email is built from
 * catalog keys `auto.nudge.<id>.{subject,heading,body,cta,reason}` in
 * lib/i18n/messages/<locale>/email.json; English text comes from the same
 * catalog, so the three languages never drift. The mailer renders the
 * recipient's language (lib/automation/mailer localizeMail).
 */
import { outboundT, renderOutbound, type OutboundText } from '@/lib/i18n/outbound'
import type { AutomationMail, MailCategory, MailI18n } from '../mailer'

type P = OutboundText['params']

export interface NudgeMailSpec {
  id: string
  category: MailCategory
  params?: P
  /** Extra body paragraphs (catalog keys) after the main body. */
  extra?: OutboundText[]
  /** Use another body key than `<id>.body`. */
  bodyKey?: string
  /** Greeting with the first name (omit for org / staff mails). */
  name?: string | null
  greet?: boolean
  cta?: { url: string } | null
  urgent?: boolean
  dedupe?: AutomationMail['dedupe']
  fromName?: string
}

const k = (id: string, part: string) => `auto.nudge.${id}.${part}`

export function nudgeMail(s: NudgeMailSpec): Omit<AutomationMail, 'to' | 'userId' | 'onceKey'> {
  const en = (t: OutboundText | OutboundText[]) => renderOutbound('email', 'en', t)
  const greet: OutboundText[] = s.greet === false ? [] : [s.name ? { key: 'auto.hi', params: { name: s.name } } : { key: 'auto.hiNoName' }]
  const body: OutboundText[] = [...greet, { key: s.bodyKey || k(s.id, 'body'), params: s.params }, ...(s.extra || [])]
  const i18n: MailI18n = {
    subject: { key: k(s.id, 'subject'), params: s.params },
    heading: { key: k(s.id, 'heading'), params: s.params },
    body,
    ...(s.cta ? { cta: { key: k(s.id, 'cta'), params: s.params } } : {}),
    reason: { key: k(s.id, 'reason'), params: s.params },
  }
  return {
    category: s.category,
    subject: en(i18n.subject),
    heading: en(i18n.heading),
    bodyText: body.map((b) => en(b)).join('\n\n'),
    cta: s.cta ? { label: en(i18n.cta!), url: s.cta.url } : null,
    reason: en(i18n.reason!),
    i18n,
    ...(s.urgent ? { urgent: true } : {}),
    ...(s.dedupe ? { dedupe: s.dedupe } : {}),
    ...(s.fromName ? { fromName: s.fromName } : {}),
  }
}

/** In-app notification text from `nudge.<id>.<part>` keys in notify.json (English stored, recipient language rendered by notify). */
export function nudgeNote(id: string, part: { title: string; message: string }, params?: P): { title: string; message: string; title_i18n: OutboundText; message_i18n: OutboundText } {
  const title_i18n = { key: `nudge.${id}.${part.title}`, params }
  const message_i18n = { key: `nudge.${id}.${part.message}`, params }
  return { title: renderOutbound('notify', 'en', title_i18n), message: renderOutbound('notify', 'en', message_i18n), title_i18n, message_i18n }
}

/** English one-off line from the email catalog (staff digests built from several lines). */
export const enLine = (key: string, params?: Record<string, string | number>) => outboundT('email', 'en')(key, params)

/** "22 Oct 2026, 14:30 UTC" — neutral date for message bodies. */
export function whenUtc(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toUTCString().slice(5, 16)}, ${d.toISOString().slice(11, 16)} UTC`
}

export function dayUtc(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toUTCString().slice(5, 16)
}

export function money(minor: number, currency: string): string {
  const cur = String(currency || 'INR').toUpperCase()
  const sym = cur === 'INR' ? '₹' : cur === 'USD' ? '$' : `${cur} `
  return `${sym}${(Math.max(0, minor) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

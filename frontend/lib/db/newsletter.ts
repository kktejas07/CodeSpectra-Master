/**
 * Newsletter subscribers repository.
 *
 * Collection: `newsletter_subscribers` — one doc per subscribed email.
 * Status flips to `unsubscribed` when a user opts out (kept for audit + easy
 * re-subscription). No PII beyond the email address itself.
 */
import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export interface NewsletterSubscriberDoc {
  id: string
  email: string
  source?: string
  status: 'subscribed' | 'unsubscribed'
  created_at: string
  unsubscribed_at?: string | null
}

export async function newsletterSubscribers(): Promise<Collection<NewsletterSubscriberDoc>> {
  return (await getMongoDb()).collection<NewsletterSubscriberDoc>('newsletter_subscribers')
}

export const newNewsletterId = (): string => randomUUID()
export { nowIso } from './ids'

/** Validate an email address (basic, matches the auth signup regex style). */
export function isEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

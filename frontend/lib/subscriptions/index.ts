/**
 * Public API for opt-in notifications (email + WhatsApp). Import from here.
 *
 *   import { subscribe, recipientsFor, sendSubscriberEmail, sendSubscriberWhatsApp } from '@/lib/subscriptions'
 *
 *   await subscribe({ email, channels: ['email'], topics: ['blog'], filters: { blog: { categories: ['ai'] } } })
 *   for (const s of await recipientsFor('blog', 'email')) {
 *     await sendSubscriberEmail(s, { type: 'blog_post', ref: postId, topic: 'blog', subject, heading, bodyHtml, reason })
 *   }
 *
 * Every send is idempotent per (subscriber, type, ref, channel) and every email
 * gets a manage / unsubscribe footer. HTTP: /api/subscriptions/{subscribe,confirm,
 * preferences,unsubscribe}; pages: /subscriptions/confirm, /subscriptions/manage.
 */
export * from './types'
export {
  subscribe, confirmEmail, unsubscribe, updatePreferences, getByLink, publicView,
  setSavedEvent, getForUser, handleWhatsAppInbound, handleEmailBounce, recipientsFor,
  subscriberStats, subscribersCsv, listSubscribers, unsubscribePatch, WHATSAPP_CONSENT_TEXT,
} from './service'
export { sendSubscriberEmail, sendSubscriberWhatsApp, renderEmailShell, manageUrl, type SendOutcome, type WhatsAppJob } from './channels'
export { matchesEventFilters, normalizeEventFilters, normalizeTopicFilters, inQuietHours, inWhatsAppSession, slugTheme, type FilterableEvent } from './filters'
export { claimDelivery, finishDelivery, deliveryKey, listDeliveries, deliveryStats } from './deliveries'
export { getSubscriptionSettings, saveSubscriptionSettings, type SubscriptionSettings } from './settings'
export { linkToken, verifyLinkToken, isLinkScope, type LinkScope } from './tokens'

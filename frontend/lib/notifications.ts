/**
 * Universal notification system — creates in-app notifications for any platform event.
 *
 * Usage:
 *   import { notify } from '@/lib/notifications'
 *
 *   await notify({
 *     user_id: '...',
 *     type: 'hackathon.results',
 *     title: 'Results Released!',
 *     message: 'Your team ranked #3 in the Frostbyte Hackathon.',
 *     link: '/hackathons/frostbyte-2026/results',
 *     icon: 'trophy',
 *     metadata: { rank: 3, event: 'frostbyte-2026' },
 *   })
 */

import { notifications, newId, nowIso } from '@/lib/db/admin'
import type { NotificationDoc } from '@/lib/db/admin'
import type { Document, Filter } from 'mongodb'
import type { Locale } from '@/lib/i18n/config'
import { hasOutboundKey, outboundT, renderOutbound, type OutboundText } from '@/lib/i18n/outbound'
import type { MessageClass } from '@/lib/messaging/budget-rules'
import type { MessageBudget } from '@/lib/messaging/budget'

// ─── All platform notification types ────────────────────────────────────────

export const NOTIFICATION_TYPES = {
  // Auth & Account
  'auth.login': { category: 'account', icon: 'log-in', default_title: 'New Login', default_link: '/dashboard/profile' },
  'auth.signup': { category: 'account', icon: 'user-plus', default_title: 'Welcome!', default_link: '/dashboard' },
  'auth.2fa_enabled': { category: 'security', icon: 'shield', default_title: '2FA Enabled', default_link: '/dashboard/settings' },
  'auth.password_changed': { category: 'security', icon: 'key', default_title: 'Password Changed', default_link: '/dashboard/settings' },

  // Billing
  'billing.subscription_created': { category: 'billing', icon: 'credit-card', default_title: 'Subscription Created', default_link: '/dashboard/billing' },
  'billing.subscription_cancelled': { category: 'billing', icon: 'credit-card', default_title: 'Subscription Cancelled', default_link: '/dashboard/billing' },
  'billing.payment_success': { category: 'billing', icon: 'check-circle', default_title: 'Payment Successful', default_link: '/dashboard/billing' },
  'billing.payment_failed': { category: 'billing', icon: 'alert-circle', default_title: 'Payment Failed', default_link: '/dashboard/billing' },
  'billing.invoice_ready': { category: 'billing', icon: 'file-text', default_title: 'Invoice Ready', default_link: '/dashboard/billing' },

  // Hackathons
  'hackathon.results': { category: 'hackathon', icon: 'trophy', default_title: 'Results Released', default_link: '/dashboard/events' },
  'hackathon.started': { category: 'hackathon', icon: 'play', default_title: 'Event Started', default_link: '/dashboard/events' },
  'hackathon.ending_soon': { category: 'hackathon', icon: 'clock', default_title: 'Ending Soon', default_link: '/dashboard/events' },
  'hackathon.team_invite': { category: 'hackathon', icon: 'users', default_title: 'Team Invitation', default_link: '/dashboard/events' },
  'hackathon.submission_graded': { category: 'hackathon', icon: 'check-circle', default_title: 'Submission Reviewed', default_link: '/dashboard/events' },
  'hackathon.submission_status': { category: 'hackathon', icon: 'send', default_title: 'Submission Status Update', default_link: '/dashboard/events' },
  'hackathon.submission_accepted': { category: 'hackathon', icon: 'check-circle', default_title: 'Submission Accepted', default_link: '/dashboard/events' },
  'hackathon.submission_rejected': { category: 'hackathon', icon: 'x-circle', default_title: 'Submission Not Selected', default_link: '/dashboard/events' },

  // Interviews
  'interview.scheduled': { category: 'interview', icon: 'video', default_title: 'Interview Scheduled', default_link: '/dashboard/interviews' },
  'interview.reminder': { category: 'interview', icon: 'clock', default_title: 'Interview Reminder', default_link: '/dashboard/interviews' },
  'interview.completed': { category: 'interview', icon: 'check-circle', default_title: 'Interview Completed', default_link: '/dashboard/interviews' },
  'interview.feedback_ready': { category: 'interview', icon: 'bar-chart', default_title: 'Feedback Ready', default_link: '/dashboard/interviews' },

  // Code Quality
  'scan.completed': { category: 'code', icon: 'search', default_title: 'Scan Complete', default_link: '/dashboard/scanner' },
  'scan.critical_issue': { category: 'code', icon: 'alert-triangle', default_title: 'Critical Issue Found', default_link: '/dashboard/scanner' },
  'scan.quality_gate_passed': { category: 'code', icon: 'check-circle', default_title: 'Quality Gate Passed', default_link: '/dashboard/scanner' },
  'scan.quality_gate_failed': { category: 'code', icon: 'x-circle', default_title: 'Quality Gate Failed', default_link: '/dashboard/scanner' },
  'scan.dependency_vuln': { category: 'code', icon: 'shield', default_title: 'Vulnerability Found', default_link: '/dashboard/scanner' },
  'scan.secret_detected': { category: 'code', icon: 'key', default_title: 'Secret Detected', default_link: '/dashboard/scanner' },

  // Reviews
  'review.requested': { category: 'code', icon: 'message-square', default_title: 'Review Requested', default_link: '/dashboard/scanner' },
  'review.completed': { category: 'code', icon: 'check-circle', default_title: 'Review Completed', default_link: '/dashboard/scanner' },
  'review.comment_added': { category: 'code', icon: 'message-circle', default_title: 'New Comment', default_link: '/dashboard/scanner' },

  // Team & Organization — there is no member-facing /dashboard/team page; invite
  // senders should pass the /dashboard/team/invites/[token] link explicitly.
  'team.invite': { category: 'team', icon: 'user-plus', default_title: 'Team Invitation', default_link: '/dashboard/notifications' },
  'team.joined': { category: 'team', icon: 'users', default_title: 'Joined Team', default_link: '/dashboard' },
  'org.invite': { category: 'team', icon: 'building', default_title: 'Organization Invitation', default_link: '/dashboard/notifications' },

  // Certifications
  'certification.earned': { category: 'learning', icon: 'award', default_title: 'Certification Earned', default_link: '/dashboard/certifications' },
  'certification.expiring': { category: 'learning', icon: 'clock', default_title: 'Certification Expiring', default_link: '/dashboard/certifications' },

  // Assessments / Exams
  'assessment.results_released': { category: 'assessment', icon: 'check-circle', default_title: 'Results Released', default_link: '/dashboard/assessments' },

  // XP / Gamification
  'xp.awarded': { category: 'learning', icon: 'star', default_title: 'XP Earned!', default_link: '/dashboard/leaderboard' },
  'xp.level_up': { category: 'learning', icon: 'trophy', default_title: 'Level Up!', default_link: '/dashboard/leaderboard' },
  'certificate.issued': { category: 'learning', icon: 'award', default_title: 'Certificate Issued', default_link: '/dashboard/certifications' },

  // System & Content Events
  'system.feedback_received': { category: 'system', icon: 'flag', default_title: 'Feedback Received', default_link: '/dashboard/admin/feedback' },
  'content.course_generated': { category: 'learning', icon: 'book-open', default_title: 'Course Generated', default_link: '/dashboard/admin/courses' },
  'content.post_published': { category: 'system', icon: 'file-text', default_title: 'Blog Post Published', default_link: '/dashboard/admin/blog' },

  // Marketplace — seller / admin (lib/marketplace/seller-notify.ts)
  'mkt.new_order': { category: 'marketplace', icon: 'shopping-bag', default_title: 'New order', default_link: '/dashboard/seller?tab=orders' },
  'mkt.low_stock': { category: 'marketplace', icon: 'package', default_title: 'Low stock', default_link: '/dashboard/seller?tab=products' },
  'mkt.payout_paid': { category: 'marketplace', icon: 'banknote', default_title: 'Payout sent', default_link: '/dashboard/seller?tab=payouts' },
  'mkt.payout_failed': { category: 'marketplace', icon: 'alert-circle', default_title: 'Payout failed', default_link: '/dashboard/seller?tab=payouts' },
  'mkt.product_approved': { category: 'marketplace', icon: 'check-circle', default_title: 'Product approved', default_link: '/dashboard/seller?tab=products' },
  'mkt.product_rejected': { category: 'marketplace', icon: 'x-circle', default_title: 'Product needs changes', default_link: '/dashboard/seller?tab=products' },
  'mkt.seller_status': { category: 'marketplace', icon: 'store', default_title: 'Seller account update', default_link: '/dashboard/seller' },
  'mkt.refund_processed': { category: 'marketplace', icon: 'rotate-ccw', default_title: 'Refund processed', default_link: '/dashboard/seller?tab=returns' },
  'mkt.seller_application': { category: 'marketplace', icon: 'store', default_title: 'New seller application', default_link: '/dashboard/admin/marketplace?tab=sellers' },
  'mkt.refund_requested': { category: 'marketplace', icon: 'rotate-ccw', default_title: 'Refund request', default_link: '/dashboard/admin/marketplace?tab=refunds' },
  'mkt.payout_requested': { category: 'marketplace', icon: 'banknote', default_title: 'Payout requested', default_link: '/dashboard/admin/marketplace?tab=payouts' },

  // Assistants, agent loops and nudges (wave 15)
  'placement.nudge': { category: 'learning', icon: 'graduation-cap', default_title: 'From your placement team', default_link: '/dashboard/study-plan' },
  'placement.practice_assigned': { category: 'learning', icon: 'clipboard-list', default_title: 'Practice assigned', default_link: '/dashboard/company-tests' },
  'placement.report_ready': { category: 'learning', icon: 'file-text', default_title: 'Placement report ready', default_link: '/dashboard/placement' },
  'placement.weekly_report': { category: 'learning', icon: 'file-text', default_title: 'Weekly placement report', default_link: '/dashboard/placement' },
  'mentor.booking.created': { category: 'marketplace', icon: 'calendar', default_title: 'Mentor session booked', default_link: '/dashboard/sessions' },
  'mentor.session_booked': { category: 'marketplace', icon: 'calendar', default_title: 'Mentor session booked', default_link: '/dashboard/sessions' },
  'mentor.session_rescheduled': { category: 'marketplace', icon: 'calendar', default_title: 'Mentor session rescheduled', default_link: '/dashboard/sessions' },
  'mentor.session_followup': { category: 'marketplace', icon: 'message-circle', default_title: 'How was your session?', default_link: '/dashboard/sessions' },
  'mentor.feedback': { category: 'marketplace', icon: 'star', default_title: 'Rate your mentor session', default_link: '/dashboard/sessions' },
  'mentor.no_show': { category: 'marketplace', icon: 'alert-circle', default_title: 'Session missed', default_link: '/dashboard/sessions' },
  'onboarding_tips': { category: 'account', icon: 'lightbulb', default_title: 'Getting started', default_link: '/dashboard' },
  'onboarding_verify': { category: 'account', icon: 'mail-check', default_title: 'Verify your account', default_link: '/dashboard/settings' },
  'assistant.onboarding_step': { category: 'system', icon: 'list-checks', default_title: 'Next setup step', default_link: '/dashboard/admin/onboarding' },
  'assistant.revenue_proposals': { category: 'system', icon: 'trending-up', default_title: 'Revenue proposals ready', default_link: '/dashboard/admin/agent' },
  'agent_loop.insight': { category: 'system', icon: 'line-chart', default_title: 'Weekly insight', default_link: '/dashboard/admin/agent-loops' },
  'agent_loop.run_finished': { category: 'system', icon: 'bot', default_title: 'Agent loop finished', default_link: '/dashboard/admin/agent-loops' },
  'hiring_agent.proposals': { category: 'system', icon: 'users', default_title: 'Hiring proposals ready', default_link: '/dashboard/admin/hiring-agents' },

  // Reminders and nudges (wave 15 + older reminders, AUTO-105)
  'streak.saver': { category: 'learning', icon: 'flame', default_title: 'Keep your streak alive', default_link: '/dashboard/arena' },
  newsletter: { category: 'system', icon: 'mail', default_title: 'Newsletter', default_link: '/newsletter' },
  'study_plan.reminder': { category: 'learning', icon: 'calendar-check', default_title: "Today's study plan", default_link: '/dashboard/study-plan' },
  'drive.reminder': { category: 'assessment', icon: 'clock', default_title: 'Hiring drive reminder', default_link: '/dashboard/assessments' },
  'drive.no_show': { category: 'assessment', icon: 'alert-circle', default_title: 'You missed a hiring drive', default_link: '/dashboard/assessments' },
  'assessment.reminder': { category: 'assessment', icon: 'clock', default_title: 'Test invite closing soon', default_link: '/dashboard/assessments' },
  'pro_cert.expiring': { category: 'learning', icon: 'clock', default_title: 'Certification expiring', default_link: '/dashboard/certifications' },
  'cohort.reminder': { category: 'learning', icon: 'alert-circle', default_title: 'Catch up with your cohort', default_link: '/dashboard/cohorts' },
  'cohort.staff': { category: 'learning', icon: 'users', default_title: 'Learners who need help', default_link: '/dashboard/cohorts' },
  'talent.invite': { category: 'hiring', icon: 'briefcase', default_title: 'An employer invited you', default_link: '/dashboard/passport#invites' },
  'talent.update': { category: 'hiring', icon: 'award', default_title: 'Talent update', default_link: '/dashboard/hiring/talent' },
  'hiring.nudge': { category: 'hiring', icon: 'clock', default_title: 'Hiring follow-up', default_link: '/dashboard/hiring' },
  'ats.bgv': { category: 'hiring', icon: 'shield-check', default_title: 'Background check update', default_link: '/dashboard/hiring' },
  'billing.plan_expiring': { category: 'billing', icon: 'credit-card', default_title: 'Your plan ends soon', default_link: '/dashboard/billing' },
  'billing.licence_expiring': { category: 'billing', icon: 'key-round', default_title: 'Licence renewal due', default_link: '/dashboard/admin/licences' },
  'billing.renewal_reminder': { category: 'billing', icon: 'credit-card', default_title: 'Your plan ends soon', default_link: '/dashboard/billing' },
  'billing.upgrade_offer': { category: 'billing', icon: 'trending-up', default_title: 'Room to grow on your plan', default_link: '/pricing' },
  'billing.winback_offer': { category: 'billing', icon: 'gift', default_title: 'An offer to come back', default_link: '/pricing' },
  'automation.message': { category: 'general', icon: 'bell', default_title: 'Notification', default_link: '' },
} as const

/**
 * Message class of a notification type for the shared per-person budget
 * (AUTO-094, lib/messaging/budget.ts). Types listed here are capped when sent
 * with notify() directly; everything else (receipts, security, results,
 * invitations, things a person asked for) bypasses the cap. Senders can pass
 * `budget` to override or add a topic/object dedupe key.
 */
export const NOTIFICATION_BUDGET_CLASS: Readonly<Record<string, MessageClass>> = {
  'streak.saver': 'engagement',
  // A reminder at the hour the learner picked: their own schedule, never capped (AUTO-108).
  'study_plan.reminder': 'subscribed',
  'onboarding_tips': 'engagement',
  'placement.nudge': 'engagement',
  'cohort.reminder': 'engagement',
  'mentor.session_followup': 'engagement',
  'mentor.feedback': 'engagement',
  'talent.invite': 'transactional',
  'billing.upgrade_offer': 'marketing',
  'billing.winback_offer': 'marketing',
  newsletter: 'marketing',
  'automation.message': 'engagement',
  'certification.expiring': 'deadline',
  'pro_cert.expiring': 'deadline',
  'billing.plan_expiring': 'deadline',
  'billing.renewal_reminder': 'deadline',
  'drive.reminder': 'deadline',
  'assessment.reminder': 'deadline',
  'hackathon.ending_soon': 'deadline',
}

export type NotificationType = keyof typeof NOTIFICATION_TYPES

/**
 * Mail category of a notification's email (AUTO-112). Marketing-class types
 * (win-back / upgrade offers) are promotional: sent as 'engagement' so they
 * carry the unsubscribe link + one-click headers and honour unsubscribe-all,
 * even though they live in the billing category. Other billing / security
 * notices can't be unsubscribed from; everything else is 'transactional'.
 */
export function notificationMailCategory(type: string, category: string): 'security' | 'billing' | 'engagement' | 'transactional' {
  if (NOTIFICATION_BUDGET_CLASS[type] === 'marketing') return 'engagement'
  return category === 'security' ? 'security' : category === 'billing' ? 'billing' : 'transactional'
}

interface NotifyInput {
  user_id: string
  type: string
  title?: string
  message?: string
  /**
   * Translatable title / message (keys in lib/i18n/messages/<locale>/notify.json),
   * rendered in the recipient's interface language and stored as plain text
   * like `title` / `message` (so existing rows keep showing). Several message
   * parts are joined with a space. A key missing from the catalog falls back
   * to `title` / `message`.
   */
  title_i18n?: OutboundText
  message_i18n?: OutboundText | OutboundText[]
  /** Recipient language when the caller already knows it (skips the profile lookup). */
  locale?: Locale
  link?: string
  icon?: string
  metadata?: Record<string, unknown>
  /** Send email too (if the user has email notifications enabled) */
  send_email?: boolean
  /** Skip the FCM push fan-out for this notification. */
  skip_push?: boolean
  /**
   * Also send WhatsApp — only to users who agreed to WhatsApp messages, through
   * the official Meta Cloud API with an approved template (lib/whatsapp-send;
   * the unofficial gateway only when a superadmin explicitly enabled it).
   */
  send_whatsapp?: boolean
  /**
   * Bypass the user's quiet hours for email/push/WhatsApp. Defaults to true
   * for `security` notifications, false otherwise (deferred to window end).
   */
  urgent?: boolean
  /**
   * Shared per-person messaging budget (AUTO-094). Default: the type's class in
   * NOTIFICATION_BUDGET_CLASS (capped types are held when the person is at
   * their cap — notify returns null); types not listed aren't capped. Pass a
   * topic + object to send the same thing once whichever sender fires first.
   * `false` only when the caller already admitted it (deliverNudge).
   */
  budget?: MessageBudget | false
  /** Called when the budget held the message (notify then returns null) — lets the sender undo its own claim and retry (AUTO-109). */
  on_held?: (outcome: 'capped' | 'duplicate') => void
}

/**
 * Create an in-app notification. Handles all defaults (title from type registry,
 * icon, timestamps, etc.). Returns the created notification or null on error.
 */
export async function notify(input: NotifyInput): Promise<NotificationDoc | null> {
  let admit: { commit: () => Promise<void>; release: () => Promise<void> } | null = null
  try {
    const typeInfo = NOTIFICATION_TYPES[input.type as NotificationType]
    const budget = input.budget === false ? null : input.budget ?? (NOTIFICATION_BUDGET_CLASS[input.type] ? { class: NOTIFICATION_BUDGET_CLASS[input.type], source: input.type } : null)
    if (budget) {
      const { admitMessage } = await import('@/lib/messaging/budget')
      const a = await admitMessage({ userId: input.user_id }, budget)
      if (!a.ok) {
        try { input.on_held?.(a.outcome) } catch { /* caller's hook never breaks notify */ }
        return null
      }
      admit = a
    }
    const col = await notifications()
    const locale = await recipientLocale(input)
    const text = notificationText(input, locale)
    const doc: NotificationDoc = {
      id: newId(),
      user_id: input.user_id,
      title: text.title,
      message: text.message,
      type: input.type,
      is_read: false,
      link: input.link || typeInfo?.default_link || '',
      icon: input.icon || typeInfo?.icon || 'bell',
      category: typeInfo?.category || 'general',
      metadata: (input.metadata || {}) as Record<string, string>,
      created_at: nowIso(),
    }
    await col.insertOne(doc)
    if (admit) await admit.commit()
    admit = null

    // Out-of-app delivery (push / email / WhatsApp). Built up front, then sent
    // now or deferred to the end of the user's quiet hours (see
    // lib/notifications-delivery.ts). Fire-and-forget so callers never block.
    void deliverOutOfApp(input, doc, locale)

    return doc
  } catch (e) {
    if (admit) await admit.release().catch(() => {})
    console.error('[notifications] Failed: notifications', e)
    return null
  }
}

/** The recipient's saved interface language (English when unset or the lookup fails). */
async function recipientLocale(input: Pick<NotifyInput, 'user_id' | 'locale'>): Promise<Locale> {
  if (input.locale) return input.locale
  const { localeForUser } = await import('@/lib/i18n/recipient')
  return localeForUser(input.user_id)
}

const keyOk = (t: OutboundText | undefined) => !!t && hasOutboundKey('notify', t.key)

/**
 * Pure: the stored title / message for a notification in `locale`.
 * English keeps the caller's own text when given (unchanged from before);
 * other languages use the keys when they exist. Then the caller's text, the
 * type's default title (translated), "Notification".
 */
export function notificationText(input: Pick<NotifyInput, 'type' | 'title' | 'message' | 'title_i18n' | 'message_i18n'>, locale: Locale): { title: string; message: string } {
  const typeInfo = NOTIFICATION_TYPES[input.type as NotificationType]
  const t = outboundT('notify', locale)
  const typeTitle = typeInfo ? (hasOutboundKey('notify', `type.${input.type}`) ? t(`type.${input.type}`) : typeInfo.default_title) : undefined
  const useKeys = (given: string | undefined) => locale !== 'en' || !given
  const title = keyOk(input.title_i18n) && useKeys(input.title) ? renderOutbound('notify', locale, input.title_i18n!) : input.title || typeTitle || t('fallbackTitle')
  const parts = input.message_i18n ? (Array.isArray(input.message_i18n) ? input.message_i18n : [input.message_i18n]) : []
  const message = parts.length && parts.every(keyOk) && useKeys(input.message) ? renderOutbound('notify', locale, parts) : input.message || ''
  return { title, message }
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function deliverOutOfApp(input: NotifyInput, doc: NotificationDoc, locale: Locale): Promise<void> {
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const { deliverOrDefer } = await import('@/lib/notifications-delivery')
    type Payload = import('@/lib/notifications-delivery').DeliveryPayload
    const payload: Payload = {}
    const wantsEmail = !!input.send_email
    const wantsWhatsApp = !!input.send_whatsapp
    const db = wantsEmail || wantsWhatsApp ? await getMongoDb() : null
    const user = db && wantsEmail
      ? await db.collection('user').findOne(
          { $or: [{ id: input.user_id }, { _id: input.user_id }] } as Filter<Document>,
          { projection: { email: 1 } },
        )
      : null
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    if (!input.skip_push) {
      payload.push = {
        title: doc.title,
        body: doc.message,
        link: doc.link || undefined,
        data: {
          type: doc.type,
          notification_id: doc.id,
          category: String(doc.category),
          icon: String(doc.icon),
          ...Object.fromEntries(Object.entries(doc.metadata || {}).map(([k, v]) => [k, String(v)])),
        },
      }
    }

    if (wantsEmail && db && user?.email) {
      // Honour both the per-type opt-out and the email channel switch.
      const [typePref, channelPref] = await Promise.all([
        db.collection('notification_preferences').findOne({ user_id: input.user_id, type: input.type }),
        db.collection('notification_preferences').findOne({ user_id: input.user_id, type: 'email' }),
      ])
      if (typePref?.enabled !== false && channelPref?.enabled !== false) {
        const et = outboundT('email', locale)
        payload.email = {
          to: String(user.email),
          locale,
          // Unsubscribes are honoured and the link added (AUTO-052); billing/security can't be unsubscribed from,
          // promotional offers can (AUTO-112).
          category: notificationMailCategory(doc.type, String(doc.category)),
          subject: doc.title,
          html: `<div lang="${locale}" style="font-family:sans-serif;padding:24px;max-width:480px">
                <h2 style="margin:0 0 8px">${esc(doc.title)}</h2>
                <p style="color:#4b5563;margin:0 0 16px">${esc(doc.message)}</p>
                ${doc.link ? `<a href="${esc(base + doc.link)}" style="display:inline-block;background:#6366f1;color:white;padding:8px 16px;border-radius:6px;text-decoration:none">${esc(et('notify.view'))}</a>` : ''}
                <p style="color:#9ca3af;font-size:12px;margin-top:24px">${esc(et('notify.footer'))}</p>
              </div>`,
        }
      }
    }

    if (wantsWhatsApp && db) {
      // Consent, opt-outs and the channel are checked when it is sent (lib/whatsapp-send).
      // Here: the per-type switch only.
      const typePref = await db.collection('notification_preferences').findOne({ user_id: input.user_id, type: input.type }, { projection: { enabled: 1, whatsapp: 1 } })
      if (typePref?.enabled !== false && typePref?.whatsapp !== false) {
        payload.whatsapp = { title: doc.title, text: doc.message, link: doc.link ? `${base}${doc.link}` : '', locale }
      }
    }

    const urgent = input.urgent ?? doc.category === 'security'
    await deliverOrDefer(input.user_id, payload, { urgent, notificationId: doc.id })
  } catch (e) {
    console.error('[notifications] out-of-app delivery failed:', e)
  }
}

/**
 * Broadcast a notification to multiple users (e.g., all team members, org members).
 */
export async function notifyMany(userIds: string[], input: Omit<NotifyInput, 'user_id'>): Promise<number> {
  let count = 0
  for (const uid of userIds) {
    const r = await notify({ ...input, user_id: uid })
    if (r) count++
  }
  return count
}

/**
 * Broadcast a notification to all superadmins.
 */
export async function notifySuperAdmins(input: Omit<NotifyInput, 'user_id'>): Promise<number> {
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const admins = await db.collection('user').find({ role: 'superadmin' }, { projection: { id: 1, _id: 1 } }).toArray()
    const userIds = admins.map(a => String(a.id || a._id))
    return await notifyMany(userIds, input)
  } catch (e) {
    console.error('[notifySuperAdmins] Error:', e)
    return 0
  }
}

/**
 * Get unread count for a user (lightweight).
 */
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const col = await notifications()
    return col.countDocuments({ user_id: userId, is_read: false })
  } catch {
    return 0
  }
}

/**
 * Notify team members about submission status changes.
 * Sends in-app, email, WhatsApp, and push notifications.
 */
export async function notifySubmissionStatusChange(
  hackathonId: string,
  hackathonName: string,
  submissionId: string,
  problemSlug: string,
  teamMembers: Array<{ user_id: string; name: string }>,
  newStatus: string,
  rejectionReason?: string,
) {
  const known = ['under_review', 'review_completed', 'accepted', 'released'] as const
  const messageKey: OutboundText = (known as readonly string[]).includes(newStatus)
    ? { key: `submission.${newStatus}` }
    : newStatus === 'rejected'
      ? (rejectionReason ? { key: 'submission.rejectedReason', params: { reason: rejectionReason } } : { key: 'submission.rejected' })
      : { key: 'submission.other', params: { status: newStatus } }

  const statusTypes: Record<string, string> = {
    under_review: 'hackathon.submission_status',
    review_completed: 'hackathon.submission_status',
    accepted: 'hackathon.submission_accepted',
    rejected: 'hackathon.submission_rejected',
    released: 'hackathon.results',
  }

  const type = statusTypes[newStatus] || 'hackathon.submission_status'

  for (const member of teamMembers) {
    await notify({
      user_id: member.user_id,
      type: type as any,
      title_i18n: { key: 'submission.title', params: { event: hackathonName, problem: problemSlug } },
      message_i18n: messageKey,
      link: `/dashboard/events/${hackathonId}`,
      metadata: {
        hackathon_id: hackathonId,
        submission_id: submissionId,
        status: newStatus,
        problem_slug: problemSlug,
      },
      send_email: true,
      send_whatsapp: true,
    })
  }
}

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

// ─── All platform notification types ────────────────────────────────────────

export const NOTIFICATION_TYPES = {
  // Auth & Account
  'auth.login': { category: 'account', icon: 'log-in', default_title: 'New Login', default_link: '/dashboard/admin/security' },
  'auth.signup': { category: 'account', icon: 'user-plus', default_title: 'Welcome!', default_link: '/dashboard' },
  'auth.2fa_enabled': { category: 'security', icon: 'shield', default_title: '2FA Enabled', default_link: '/dashboard/admin/settings' },
  'auth.password_changed': { category: 'security', icon: 'key', default_title: 'Password Changed', default_link: '/dashboard/admin/settings' },

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
  'scan.completed': { category: 'code', icon: 'search', default_title: 'Scan Complete', default_link: '/dashboard/projects' },
  'scan.critical_issue': { category: 'code', icon: 'alert-triangle', default_title: 'Critical Issue Found', default_link: '/dashboard/projects' },
  'scan.quality_gate_passed': { category: 'code', icon: 'check-circle', default_title: 'Quality Gate Passed', default_link: '/dashboard/projects' },
  'scan.quality_gate_failed': { category: 'code', icon: 'x-circle', default_title: 'Quality Gate Failed', default_link: '/dashboard/projects' },
  'scan.dependency_vuln': { category: 'code', icon: 'shield', default_title: 'Vulnerability Found', default_link: '/dashboard/projects' },
  'scan.secret_detected': { category: 'code', icon: 'key', default_title: 'Secret Detected', default_link: '/dashboard/projects' },

  // Reviews
  'review.requested': { category: 'code', icon: 'message-square', default_title: 'Review Requested', default_link: '/dashboard/projects' },
  'review.completed': { category: 'code', icon: 'check-circle', default_title: 'Review Completed', default_link: '/dashboard/projects' },
  'review.comment_added': { category: 'code', icon: 'message-circle', default_title: 'New Comment', default_link: '/dashboard/projects' },

  // Team & Organization
  'team.invite': { category: 'team', icon: 'user-plus', default_title: 'Team Invitation', default_link: '/dashboard/team' },
  'team.joined': { category: 'team', icon: 'users', default_title: 'Joined Team', default_link: '/dashboard/team' },
  'org.invite': { category: 'team', icon: 'building', default_title: 'Organization Invitation', default_link: '/dashboard/team' },

  // Certifications
  'certification.earned': { category: 'learning', icon: 'award', default_title: 'Certification Earned', default_link: '/dashboard/certifications' },
  'certification.expiring': { category: 'learning', icon: 'clock', default_title: 'Certification Expiring', default_link: '/dashboard/certifications' },

  // Assessments / Exams
  'assessment.results_released': { category: 'assessment', icon: 'check-circle', default_title: 'Results Released', default_link: '/dashboard/assessments' },

  // XP / Gamification
  'xp.awarded': { category: 'learning', icon: 'star', default_title: 'XP Earned!', default_link: '/dashboard/leaderboard' },
  'xp.level_up': { category: 'learning', icon: 'trophy', default_title: 'Level Up!', default_link: '/dashboard/leaderboard' },
  'certificate.issued': { category: 'learning', icon: 'award', default_title: 'Certificate Issued', default_link: '/dashboard/certifications' },

  // General
  'system.announcement': { category: 'system', icon: 'megaphone', default_title: 'Announcement', default_link: '/dashboard' },
  'system.maintenance': { category: 'system', icon: 'tool', default_title: 'Maintenance Notice', default_link: '/dashboard' },
} as const

export type NotificationType = keyof typeof NOTIFICATION_TYPES

interface NotifyInput {
  user_id: string
  type: string
  title?: string
  message?: string
  link?: string
  icon?: string
  metadata?: Record<string, unknown>
  /** Send email too (if the user has email notifications enabled) */
  send_email?: boolean
  /** Skip the FCM push fan-out for this notification. */
  skip_push?: boolean
  /** Send WhatsApp notification (if configured and user has phone). */
  send_whatsapp?: boolean
  /** WhatsApp phone number override (if not in user profile). */
  whatsapp_phone?: string
}

/**
 * Create an in-app notification. Handles all defaults (title from type registry,
 * icon, timestamps, etc.). Returns the created notification or null on error.
 */
export async function notify(input: NotifyInput): Promise<NotificationDoc | null> {
  try {
    const typeInfo = NOTIFICATION_TYPES[input.type as NotificationType]
    const col = await notifications()
    const doc: NotificationDoc = {
      id: newId(),
      user_id: input.user_id,
      title: input.title || typeInfo?.default_title || 'Notification',
      message: input.message || '',
      type: input.type,
      is_read: false,
      link: input.link || typeInfo?.default_link || '',
      icon: input.icon || typeInfo?.icon || 'bell',
      category: typeInfo?.category || 'general',
      metadata: (input.metadata || {}) as Record<string, string>,
      created_at: nowIso(),
    }
    await col.insertOne(doc)

    // Real-time FCM push (fire-and-forget, best effort)
    if (!input.skip_push) {
      try {
        const { sendPushToUser } = await import('@/lib/push-notifications')
        void sendPushToUser(input.user_id, {
          title: doc.title,
          body: doc.message,
          link: doc.link || undefined,
          data: {
            type: doc.type,
            category: String(doc.category),
            icon: String(doc.icon),
            ...Object.fromEntries(
              Object.entries(doc.metadata || {}).map(([k, v]) => [k, String(v)]),
            ),
          },
        })
      } catch { /* push is optional */ }
    }

    // Optional email delivery
    if (input.send_email) {
      try {
        const { getMongoDb } = await import('@/lib/mongodb')
        const db = await getMongoDb()
        const pref = await db.collection('notification_preferences').findOne({
          user_id: input.user_id,
          type: input.type,
        })
        if (!pref || pref.enabled !== false) {
          const user = await db.collection('user').findOne(
            { $or: [{ id: input.user_id }, { _id: input.user_id }] } as Filter<Document>,
            { projection: { email: 1 } },
          )
          if (user?.email) {
            const { sendEmail } = await import('@/lib/send-email')
            await sendEmail(String(user.email), {
              subject: doc.title,
              html: `<div style="font-family:sans-serif;padding:24px;max-width:480px">
                <h2 style="margin:0 0 8px">${doc.title}</h2>
                <p style="color:#4b5563;margin:0 0 16px">${doc.message}</p>
                ${doc.link ? `<a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${doc.link}" style="display:inline-block;background:#6366f1;color:white;padding:8px 16px;border-radius:6px;text-decoration:none">View</a>` : ''}
                <p style="color:#9ca3af;font-size:12px;margin-top:24px">CodeSpectra Notification</p>
              </div>`,
            })
          }
        }
      } catch { /* email is optional */ }
    }

    // Optional WhatsApp delivery
    if (input.send_whatsapp || input.whatsapp_phone) {
      try {
        const { isWhatsAppConfigured, sendWhatsAppText, normalizePhone } = await import('@/lib/whatsapp')
        if (await isWhatsAppConfigured()) {
          let phone = input.whatsapp_phone || ''
          if (!phone) {
            const { getMongoDb } = await import('@/lib/mongodb')
            const db = await getMongoDb()
            const user = await db.collection('user').findOne(
              { $or: [{ id: input.user_id }, { _id: input.user_id }] } as Filter<Document>,
              { projection: { phone: 1, phone_number: 1, whatsapp: 1 } },
            )
            phone = String(user?.phone || user?.phone_number || user?.whatsapp || '')
          }
          if (phone) {
            const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
            let text = `*${doc.title}*\n\n${doc.message}`
            if (doc.link) text += `\n\n${base}${doc.link}`
            void sendWhatsAppText(phone, text) // fire-and-forget
          }
        }
      } catch { /* whatsapp is optional */ }
    }

    return doc
  } catch (e) {
    console.error('[notifications] Failed: notifications', e)
    return null
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
  const statusMessages: Record<string, string> = {
    under_review: 'Your submission is now under review',
    review_completed: 'Your submission review is complete',
    accepted: 'Your submission has been accepted!',
    rejected: `Your submission was not selected${rejectionReason ? `: ${rejectionReason}` : ''}`,
    released: 'Your score has been released!',
  }

  const statusTypes: Record<string, string> = {
    under_review: 'hackathon.submission_status',
    review_completed: 'hackathon.submission_status',
    accepted: 'hackathon.submission_accepted',
    rejected: 'hackathon.submission_rejected',
    released: 'hackathon.results',
  }

  const message = statusMessages[newStatus] || `Submission status updated to ${newStatus}`
  const type = statusTypes[newStatus] || 'hackathon.submission_status'

  for (const member of teamMembers) {
    await notify({
      user_id: member.user_id,
      type: type as any,
      title: `${hackathonName} — ${problemSlug}`,
      message,
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

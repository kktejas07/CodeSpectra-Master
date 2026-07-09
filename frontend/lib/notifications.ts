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
  'auth.login': { category: 'account', icon: 'log-in', default_title: 'New Login' },
  'auth.signup': { category: 'account', icon: 'user-plus', default_title: 'Welcome!' },
  'auth.2fa_enabled': { category: 'security', icon: 'shield', default_title: '2FA Enabled' },
  'auth.password_changed': { category: 'security', icon: 'key', default_title: 'Password Changed' },

  // Billing
  'billing.subscription_created': { category: 'billing', icon: 'credit-card', default_title: 'Subscription Created' },
  'billing.subscription_cancelled': { category: 'billing', icon: 'credit-card', default_title: 'Subscription Cancelled' },
  'billing.payment_success': { category: 'billing', icon: 'check-circle', default_title: 'Payment Successful' },
  'billing.payment_failed': { category: 'billing', icon: 'alert-circle', default_title: 'Payment Failed' },
  'billing.invoice_ready': { category: 'billing', icon: 'file-text', default_title: 'Invoice Ready' },

  // Hackathons
  'hackathon.results': { category: 'hackathon', icon: 'trophy', default_title: 'Results Released' },
  'hackathon.started': { category: 'hackathon', icon: 'play', default_title: 'Event Started' },
  'hackathon.ending_soon': { category: 'hackathon', icon: 'clock', default_title: 'Ending Soon' },
  'hackathon.team_invite': { category: 'hackathon', icon: 'users', default_title: 'Team Invitation' },
  'hackathon.submission_graded': { category: 'hackathon', icon: 'check-circle', default_title: 'Submission Reviewed' },

  // Interviews
  'interview.scheduled': { category: 'interview', icon: 'video', default_title: 'Interview Scheduled' },
  'interview.reminder': { category: 'interview', icon: 'clock', default_title: 'Interview Reminder' },
  'interview.completed': { category: 'interview', icon: 'check-circle', default_title: 'Interview Completed' },
  'interview.feedback_ready': { category: 'interview', icon: 'bar-chart', default_title: 'Feedback Ready' },

  // Code Quality
  'scan.completed': { category: 'code', icon: 'search', default_title: 'Scan Complete' },
  'scan.critical_issue': { category: 'code', icon: 'alert-triangle', default_title: 'Critical Issue Found' },
  'scan.quality_gate_passed': { category: 'code', icon: 'check-circle', default_title: 'Quality Gate Passed' },
  'scan.quality_gate_failed': { category: 'code', icon: 'x-circle', default_title: 'Quality Gate Failed' },
  'scan.dependency_vuln': { category: 'code', icon: 'shield', default_title: 'Vulnerability Found' },
  'scan.secret_detected': { category: 'code', icon: 'key', default_title: 'Secret Detected' },

  // Reviews
  'review.requested': { category: 'code', icon: 'message-square', default_title: 'Review Requested' },
  'review.completed': { category: 'code', icon: 'check-circle', default_title: 'Review Completed' },
  'review.comment_added': { category: 'code', icon: 'message-circle', default_title: 'New Comment' },

  // Team & Organization
  'team.invite': { category: 'team', icon: 'user-plus', default_title: 'Team Invitation' },
  'team.joined': { category: 'team', icon: 'users', default_title: 'Joined Team' },
  'org.invite': { category: 'team', icon: 'building', default_title: 'Organization Invitation' },

  // Certifications
  'certification.earned': { category: 'learning', icon: 'award', default_title: 'Certification Earned' },
  'certification.expiring': { category: 'learning', icon: 'clock', default_title: 'Certification Expiring' },

  // General
  'system.announcement': { category: 'system', icon: 'megaphone', default_title: 'Announcement' },
  'system.maintenance': { category: 'system', icon: 'tool', default_title: 'Maintenance Notice' },
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
      link: input.link || '',
      icon: input.icon || typeInfo?.icon || 'bell',
      category: typeInfo?.category || 'general',
      metadata: (input.metadata || {}) as Record<string, string>,
      created_at: nowIso(),
    }
    await col.insertOne(doc)

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
            const { sendEmail } = await import('@/lib/email-templates')
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

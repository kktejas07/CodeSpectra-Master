/**
 * Email delivery tracking — logs every outbound email for monitoring.
 *
 * Collection: `email_logs` — one doc per email sent.
 * Tracks: recipient, subject, campaign, delivery status, bounce/spam reason,
 * IP/geo of the recipient (if available), timestamps.
 *
 * Integrates with Postal webhook for delivery status updates.
 */

import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

// ── Document Types ───────────────────────────────────────────────────────────

export type EmailDeliveryStatus =
  | 'sending'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'spam'
  | 'deferred'
  | null

export interface EmailLogDoc {
  _id?: string
  id: string
  to_email: string
  subject: string
  category: 'transactional' | 'newsletter' | 'invite' | 'notification'
  campaign_id?: string | null
  postal_message_id?: number | null
  delivery_status: EmailDeliveryStatus
  delivery_error?: string | null
  delivery_updated_at?: string | null
  sender_ip?: string | null
  user_agent?: string | null
  device_info?: {
    browser: { name: string; version: string }
    os: { name: string; version: string }
    device_type: string
  } | null
  geo?: {
    country?: string
    region?: string
    city?: string
    timezone?: string
  } | null
  is_disposable?: boolean
  risk_score?: number
  created_at: string
  updated_at: string
}

// ── Collection Helpers ───────────────────────────────────────────────────────

export async function emailLogs(): Promise<Collection<EmailLogDoc>> {
  return (await getMongoDb()).collection<EmailLogDoc>('email_logs')
}

export function newEmailLogId(): string {
  return randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Log an outbound email. Call right after sendEmailViaPostal succeeds.
 */
export async function logEmailSend(params: {
  to: string
  subject: string
  category: EmailLogDoc['category']
  campaignId?: string | null
  postalMessageId?: number | null
  senderIp?: string | null
  userAgent?: string | null
  deviceInfo?: EmailLogDoc['device_info']
  geo?: EmailLogDoc['geo']
}): Promise<EmailLogDoc> {
  const col = await emailLogs()
  const doc: EmailLogDoc = {
    id: newEmailLogId(),
    to_email: params.to.toLowerCase().trim(),
    subject: params.subject,
    category: params.category,
    campaign_id: params.campaignId || null,
    postal_message_id: params.postalMessageId || null,
    delivery_status: 'sending',
    delivery_error: null,
    delivery_updated_at: null,
    sender_ip: params.senderIp || null,
    user_agent: params.userAgent || null,
    device_info: params.deviceInfo || null,
    geo: params.geo || null,
    is_disposable: false,
    risk_score: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  await col.insertOne(doc)
  return doc
}

/**
 * Update delivery status (called by Postal webhook or send-error handler).
 */
export async function updateEmailDeliveryStatus(
  postalMessageId: number | string,
  status: EmailDeliveryStatus,
  error?: string | null,
): Promise<boolean> {
  const col = await emailLogs()
  const result = await col.updateOne(
    { postal_message_id: Number(postalMessageId) },
    {
      $set: {
        delivery_status: status,
        delivery_error: error || null,
        delivery_updated_at: nowIso(),
        updated_at: nowIso(),
      },
    },
  )
  return result.modifiedCount > 0
}

/**
 * List email logs with filters. Used by the admin monitoring page.
 */
export async function listEmailLogs(filters: {
  status?: EmailDeliveryStatus
  category?: EmailLogDoc['category']
  campaignId?: string
  search?: string
  startDate?: string
  endDate?: string
  limit?: number
  skip?: number
} = {}): Promise<{ logs: EmailLogDoc[]; total: number }> {
  const col = await emailLogs()
  const query: Record<string, unknown> = {}

  if (filters.status) query.delivery_status = filters.status
  if (filters.category) query.category = filters.category
  if (filters.campaignId) query.campaign_id = filters.campaignId
  if (filters.search) {
    query.$or = [
      { to_email: { $regex: filters.search, $options: 'i' } },
      { subject: { $regex: filters.search, $options: 'i' } },
    ]
  }
  if (filters.startDate || filters.endDate) {
    query.created_at = {}
    if (filters.startDate) (query.created_at as Record<string, string>).$gte = filters.startDate
    if (filters.endDate) (query.created_at as Record<string, string>).$lte = filters.endDate
  }

  const total = await col.countDocuments(query)
  const logs = await col
    .find(query)
    .sort({ created_at: -1 })
    .limit(filters.limit || 100)
    .skip(filters.skip || 0)
    .toArray()

  return { logs, total }
}

/**
 * Aggregate stats for the monitoring dashboard.
 */
export async function getEmailDeliveryStats(filters: {
  startDate?: string
  endDate?: string
  campaignId?: string
} = {}): Promise<{
  total: number
  delivered: number
  bounced: number
  failed: number
  spam: number
  sending: number
  byDomain: { _id: string; count: number }[]
  byCountry: { _id: string; count: number }[]
  byCategory: { _id: string; count: number }[]
  bounceReasons: { _id: string; count: number }[]
}> {
  const col = await emailLogs()
  const match: Record<string, unknown> = {}
  if (filters.startDate || filters.endDate) {
    match.created_at = {}
    if (filters.startDate) (match.created_at as Record<string, string>).$gte = filters.startDate
    if (filters.endDate) (match.created_at as Record<string, string>).$lte = filters.endDate
  }
  if (filters.campaignId) match.campaign_id = filters.campaignId

  const total = await col.countDocuments(match)
  const delivered = await col.countDocuments({ ...match, delivery_status: 'delivered' })
  const bounced = await col.countDocuments({ ...match, delivery_status: 'bounced' })
  const failed = await col.countDocuments({ ...match, delivery_status: 'failed' })
  const spam = await col.countDocuments({ ...match, delivery_status: 'spam' })
  const sending = await col.countDocuments({ ...match, delivery_status: 'sending' })

  const [byDomain, byCountry, byCategory, bounceReasons] = await Promise.all([
    col.aggregate([
      { $match: match },
      { $addFields: { domain: { $arrayElemAt: [{ $split: ['$to_email', '@'] }, 1] } } },
      { $group: { _id: '$domain', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]).toArray() as Promise<{ _id: string; count: number }[]>,
    col.aggregate([
      { $match: { ...match, 'geo.country': { $exists: true, $ne: '' } } },
      { $group: { _id: '$geo.country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]).toArray() as Promise<{ _id: string; count: number }[]>,
    col.aggregate([
      { $match: match },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]).toArray() as Promise<{ _id: string; count: number }[]>,
    col.aggregate([
      { $match: { ...match, delivery_status: { $in: ['bounced', 'failed'] }, delivery_error: { $exists: true, $ne: null } } },
      { $group: { _id: '$delivery_error', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]).toArray() as Promise<{ _id: string; count: number }[]>,
  ])

  return {
    total,
    delivered,
    bounced,
    failed,
    spam,
    sending,
    byDomain,
    byCountry,
    byCategory,
    bounceReasons,
  }
}

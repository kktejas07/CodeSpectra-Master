/**
 * Subscriptions — one record per contact (email and/or WhatsApp number and/or
 * signed-in user) holding channels, topics and per-topic filters. Shared by
 * the events feed and any other feature that mails or messages people who
 * opted in (e.g. the knowledge blog: topic 'blog').
 */

export const CHANNELS = ['email', 'whatsapp'] as const
export type Channel = (typeof CHANNELS)[number]

/** Add a topic here when a new feature needs opt-in notifications. */
export const TOPICS = ['events', 'blog'] as const
export type Topic = (typeof TOPICS)[number]

export const EVENT_KINDS = ['hackathon', 'codeathon', 'buildathon', 'ctf', 'competition', 'conference'] as const
export type EventKind = (typeof EVENT_KINDS)[number]
export const EVENT_MODES = ['online', 'in_person', 'hybrid'] as const
export type EventMode = (typeof EVENT_MODES)[number]

/** Filters for topic 'events'. Empty / missing = no restriction. */
export interface EventFilters {
  kinds?: EventKind[]
  modes?: EventMode[]
  /** ISO-3166 alpha-2, upper case. */
  countries?: string[]
  themes?: string[]
  /** Only events with a cash prize of at least this (integer minor units, USD). */
  min_prize_usd_minor?: number
}

/** Free-form filters for other topics (e.g. blog categories). */
export interface TopicFilters {
  events?: EventFilters
  blog?: { categories?: string[] }
}

export type EmailStatus = 'none' | 'pending' | 'active' | 'unsubscribed' | 'bounced'
export type WhatsAppStatus = 'none' | 'pending' | 'active' | 'unsubscribed'

export interface SubscriberDoc {
  id: string
  email: string | null
  /** E.164 (+919876543210). */
  phone: string | null
  user_id: string | null
  email_status: EmailStatus
  email_confirmed_at: string | null
  email_bounces: number
  whatsapp_status: WhatsAppStatus
  /** Explicit opt-in record (text shown + when). Never re-used for another number. */
  whatsapp_consent: { text: string; at: string; via: 'web' | 'keyword' | 'account' } | null
  /** Last message the person sent us — opens Meta's 24-hour customer-service window. */
  whatsapp_last_inbound_at: string | null
  topics: Topic[]
  filters: TopicFilters
  /** Requested change waiting for email confirmation (double opt-in). */
  pending: { topics: Topic[]; filters: TopicFilters; requested_at: string } | null
  /** IANA zone for quiet hours / digest rendering. */
  timezone: string
  /** Event ids the person asked to be reminded about (48 h before registration closes). */
  saved_events: string[]
  /** Rotating secret baked into every unsubscribe / manage link; rotate to revoke them all. */
  token_nonce: string
  source: string
  created_at: string
  updated_at: string
}

export type DeliveryType = 'confirm' | 'optin' | 'alert' | 'digest' | 'reminder' | 'test' | (string & {})

export interface DeliveryDoc {
  /** `${subscriber_id}:${type}:${ref}:${channel}` — unique; makes every send idempotent. */
  key: string
  subscriber_id: string
  type: DeliveryType
  /** Event id, digest week, blog post id… */
  ref: string
  channel: Channel
  topic: Topic | null
  status: 'sending' | 'sent' | 'failed' | 'bounced'
  attempts: number
  error: string | null
  provider_id: string | null
  postal_message_id: number | null
  created_at: string
  updated_at: string
}

export interface SubscribeInput {
  email?: string | null
  phone?: string | null
  user_id?: string | null
  channels: Channel[]
  topics: Topic[]
  filters?: TopicFilters
  /** Required (true) when channels include 'whatsapp'. */
  whatsapp_consent?: boolean
  /** Country used to read a phone number typed without a +code (default IN). */
  phone_country?: string | null
  timezone?: string | null
  source?: string
}

/** Server-side facts the public body can't claim. */
export interface SubscribeTrust {
  /** Email belongs to the signed-in user (skip double opt-in). */
  emailVerified?: boolean
  /** Phone verified on the account (skip the WhatsApp YES reply). */
  phoneVerified?: boolean
}

export interface SubscribeResult {
  ok: boolean
  error?: string
  subscriber_id?: string
  email?: 'confirmation_sent' | 'active' | 'unchanged' | 'skipped'
  whatsapp?: 'confirmation_sent' | 'active' | 'unchanged' | 'skipped'
}

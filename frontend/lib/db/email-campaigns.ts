/**
 * Email campaign repository.
 *
 * Collection: `email_campaigns` — one doc per newsletter campaign.
 * Tracks delivery stats across channels (email, push, in-app).
 */
import { randomUUID, randomBytes } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export interface CampaignChannels {
  email: boolean
  push: boolean
  in_app: boolean
}

export interface EmailCampaignDoc {
  id: string
  campaign_id: string
  subject: string
  hero_image?: string
  intro?: string
  body: string
  cta_text?: string
  cta_url?: string
  include_upcoming: boolean
  channels: CampaignChannels
  recipients_count: number
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled'
  send_at?: string | null
  email_ok: number
  email_fail: number
  push_ok: number
  push_fail: number
  in_app_ok: number
  created_at: string
  completed_at?: string | null
  created_by: string
}

export async function emailCampaigns(): Promise<Collection<EmailCampaignDoc>> {
  return (await getMongoDb()).collection<EmailCampaignDoc>('email_campaigns')
}

export function newCampaignId(): string {
  return randomBytes(8).toString('hex')
}

export function newId(): string {
  return randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

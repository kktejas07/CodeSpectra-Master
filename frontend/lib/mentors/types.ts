/**
 * Mentor marketplace — shared types and constants (client-safe, no server imports).
 *
 * A mentor is an approved marketplace seller (lib/marketplace/sellers.ts) with a mentor
 * profile (collection `mentor_profiles`). Offerings are ordinary marketplace `service`
 * products (category mentoring / mock-interviews), so checkout, commission, ledger, refunds,
 * payouts, reviews and booking reminders are the marketplace's own (lib/marketplace/*).
 * The mentor layer adds: profile + admin verification, one availability set copied onto
 * every offering (weekly rules, time zone, buffer, max sessions per day), rescheduling,
 * code-review attachments, disputes and the public /mentors directory.
 */

export const OFFERING_TYPES = ['mock_interview', 'code_review', 'career_guidance', 'resume_review'] as const
export type OfferingType = (typeof OFFERING_TYPES)[number]

export const OFFERING_LABELS: Record<OfferingType, string> = {
  mock_interview: 'Mock interview',
  code_review: 'Code review',
  career_guidance: 'Career guidance',
  resume_review: 'Resume review',
}

/** Marketplace category each offering type is listed under (lib/marketplace/settings.ts CATEGORIES). */
export const OFFERING_CATEGORY: Record<OfferingType, 'mock-interviews' | 'mentoring'> = {
  mock_interview: 'mock-interviews',
  code_review: 'mentoring',
  career_guidance: 'mentoring',
  resume_review: 'mentoring',
}

export const isOfferingType = (v: unknown): v is OfferingType => typeof v === 'string' && (OFFERING_TYPES as readonly string[]).includes(v)

export type MentorStatus = 'pending' | 'verified' | 'rejected' | 'suspended'

export interface MentorAvailability {
  timezone: string
  weekly: { dow: number; start: string; end: string }[]
  buffer_min: number
  /** 0 = no cap */
  max_per_day: number
}

export interface MentorPolicy {
  /** Buyer may reschedule up to this many hours before the start. */
  reschedule_hours: number
  /** Reschedules allowed per booking. */
  max_reschedules: number
}

export interface MentorProfile {
  id: string
  user_id: string
  seller_id: string
  /** = seller slug (public URL /mentors/[slug]) */
  slug: string
  display_name: string
  headline: string
  bio: string
  skills: string[]
  companies: string[]
  experience_years: number
  languages: string[]
  linkedin_url?: string | null
  avatar_url?: string | null
  availability: MentorAvailability
  policy: MentorPolicy
  status: MentorStatus
  /** listed in /mentors (needs verified + approved seller) */
  listed: boolean
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  rating?: { avg: number; count: number }
  sessions_completed?: number
  created_at: string
  updated_at: string
}

/** Per booking extras (collection `mentor_session_meta`, one row per marketplace booking). */
export interface SessionMeta {
  booking_id: string
  order_id: string
  line_id: string
  seller_id: string
  buyer_id: string
  offering_type?: OfferingType | null
  /** Code review: one of the buyer's own practice submissions, or a public repository link. */
  attachment?: { kind: 'submission'; submission_id: string; problem_title?: string; language?: string; attached_at: string } | { kind: 'link'; url: string; attached_at: string } | null
  note?: string | null
  reschedules: { from: string; to: string; at: string; by: string }[]
  dispute_id?: string | null
  created_at: string
  updated_at: string
}

export interface PublicOffering {
  product_id: string
  slug: string
  type: OfferingType
  title: string
  description_md: string
  duration_min: number
  currency: 'INR' | 'USD'
  price: number
  rating?: { avg: number; count: number }
  mode: string
  timezone: string
}

export interface PublicMentor {
  slug: string
  display_name: string
  headline: string
  bio: string
  skills: string[]
  companies: string[]
  experience_years: number
  languages: string[]
  linkedin_url?: string | null
  avatar_url?: string | null
  rating: { avg: number; count: number }
  sessions_completed: number
  offerings: PublicOffering[]
  /** lowest offering price per currency, minor units */
  from_price: { INR?: number; USD?: number }
  timezone: string
}

export const DEFAULT_POLICY: MentorPolicy = { reschedule_hours: 12, max_reschedules: 1 }
export const DEFAULT_AVAILABILITY: MentorAvailability = { timezone: 'Asia/Kolkata', weekly: [], buffer_min: 15, max_per_day: 4 }

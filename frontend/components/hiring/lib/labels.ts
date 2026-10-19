/**
 * Plain-language labels and small formatters for the hiring (ATS) screens.
 * Pure and client-safe; shared by every page under app/dashboard/hiring.
 */
import type {
  ApplicationStatus,
  BotChannel,
  CandidateSource,
  JobStatus,
  MeetingProvider,
  StageType,
} from '@/lib/ats/contract'

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
  applied: 'Applied',
  screening: 'Résumé screening',
  assessment: 'Assessment',
  bot_screen: 'Bot screen',
  virtual_interview: 'Virtual interview',
  f2f_interview: 'Face-to-face interview',
  client_review: 'Client review',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  custom: 'Custom step',
}

export const STAGE_TYPE_HINTS: Record<StageType, string> = {
  applied: 'Where every new candidate lands.',
  screening: 'Scores the résumé against the screening criteria.',
  assessment: 'Sends one of your CodeSpectra tests.',
  bot_screen: 'A WhatsApp or phone bot asks your screening questions.',
  virtual_interview: 'Video interview with a panel.',
  f2f_interview: 'In-person interview at your office.',
  client_review: 'Your client reviews the profile and decides.',
  offer: 'Prepare and send the offer.',
  hired: 'Candidate accepted the offer.',
  rejected: 'Not moving forward.',
  custom: 'Any other step you track by hand.',
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  on_hold: 'On hold',
  closed: 'Closed',
  filled: 'Filled',
}

export const JOB_STATUS_VARIANT: Record<JobStatus, 'success' | 'warning' | 'outline' | 'secondary' | 'info'> = {
  draft: 'outline',
  open: 'success',
  on_hold: 'warning',
  closed: 'secondary',
  filled: 'info',
}

/** Allowed job status changes (mirrors lib/ats/pipeline TRANSITIONS; the server re-checks). */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['open', 'closed'],
  open: ['on_hold', 'closed', 'filled'],
  on_hold: ['open', 'closed'],
  closed: ['open'],
  filled: ['open', 'closed'],
}

export const APP_STATUS_LABELS: Record<ApplicationStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export const SOURCE_LABELS: Record<CandidateSource, string> = {
  apply_page: 'Apply page',
  bulk_upload: 'Bulk upload',
  manual: 'Added by hand',
  csv: 'CSV import',
  talent_pool: 'Talent pool',
  referral: 'Referral',
  copilot: 'Copilot',
}

export const PROVIDER_LABELS: Record<MeetingProvider, string> = {
  livekit: 'CodeSpectra video (built in)',
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Microsoft Teams',
  manual: 'Paste a meeting link',
}

export const CHANNEL_LABELS: Record<BotChannel, string> = {
  whatsapp_chat: 'WhatsApp chat',
  whatsapp_call: 'WhatsApp call',
  phone_call: 'Phone call',
}

export const WORK_MODE_LABELS = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' } as const
export const EMPLOYMENT_LABELS = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
} as const

export const MATCH_WEIGHT_LABELS = {
  must: 'Must-have skills',
  nice: 'Nice-to-have skills',
  keywords: 'Keywords',
  years: 'Experience',
  location: 'Location',
  notice: 'Notice period',
  education: 'Education',
  salary: 'Salary',
  ai: 'AI fit',
} as const
export type MatchWeightKey = keyof typeof MATCH_WEIGHT_LABELS

/** Whole days between an ISO date and now (never negative). */
export function daysSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / 86_400_000))
}

/** "Today", "1 day", "5 days" — for time-in-stage chips. */
export function durationLabel(days: number): string {
  if (days <= 0) return 'Today'
  return days === 1 ? '1 day' : `${days} days`
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const mins = Math.floor((now - t) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return days === 1 ? 'Yesterday' : `${days} days ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} mo ago`
  return `${Math.floor(months / 12)} y ago`
}

/** Compact salary range, e.g. "₹12L – ₹18L / year" or "$90k – $120k / year". */
export function formatSalary(s: { min?: number; max?: number; currency?: string; period?: string } | null | undefined): string | null {
  if (!s || (s.min == null && s.max == null)) return null
  const cur = (s.currency || 'INR').toUpperCase()
  const sym = cur === 'INR' ? '₹' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : `${cur} `
  const fmt = (n: number) => {
    if (cur === 'INR') return n >= 100_000 ? `${sym}${+(n / 100_000).toFixed(1)}L` : `${sym}${n.toLocaleString('en-IN')}`
    return n >= 1000 ? `${sym}${+(n / 1000).toFixed(0)}k` : `${sym}${n}`
  }
  const range = s.min != null && s.max != null ? `${fmt(s.min)} – ${fmt(s.max)}` : fmt((s.min ?? s.max) as number)
  return s.period ? `${range} / ${s.period}` : range
}

export function initials(name: string | null | undefined): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Tailwind classes for a 0–100 match score chip (status colours, never brand). */
export function scoreTone(score: number | null | undefined): string {
  if (score == null) return 'bg-muted text-muted-foreground'
  if (score >= 75) return 'bg-green-500/15 text-green-700 dark:text-green-400'
  if (score >= 50) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-red-500/15 text-red-700 dark:text-red-400'
}

/**
 * Digest verifier rules (pure, no I/O). The verifier agent (lib/digest/loop)
 * gathers the evidence — the item re-read from its own collection, the link
 * check, recent digests — and these rules decide:
 *
 *   item rejected  closed · stale · missing_facts · broken_link · duplicate ·
 *                  repeat · flagged · gone        → replaced from the next best
 *   summary fixed  invented_facts · has_url · too_long · empty
 *                                                  → template summary instead
 *
 * "Invented facts": every number (dates, prizes, counts — Devanagari / Telugu
 * digits included) in a summary must appear in the item's own facts.
 */
import { unsupportedNumbers } from '@/lib/social/captions'
import { candidateFactsText } from './candidates'
import { isNearDuplicate, isOpen } from './rank'
import type { DigestCandidate, DigestLocale, DigestSummary, RejectReason, SummaryIssue, VerifyResult } from './types'

const DAY = 86_400_000
export const SUMMARY_MAX = 280

export interface LinkCheck {
  ok: boolean
  status?: number
  /** Network error / timeout (no HTTP answer at all). */
  error?: string
}

export interface VerifyEvidence {
  now: Date
  /** The item as it is now in its own collection (null = gone / unpublished). */
  current: Pick<DigestCandidate, 'title' | 'url' | 'deadline' | 'ends_at' | 'starts_at' | 'group' | 'published_at'> | null
  /** Result of checking the source link (undefined = not checked). */
  link?: LinkCheck
  /** Items already verified in this digest (dedupe). */
  verified: readonly Pick<DigestCandidate, 'key' | 'url' | 'source_url' | 'title' | 'starts_at'>[]
  /** Keys featured in the last `repeat_days` digests. */
  recentKeys: ReadonlySet<string>
  maxAgeDays: number
  /** Prompt guard verdict on the item's third-party text. */
  flagged?: boolean
}

/** A link is broken when the page answered 404 / 410 / 5xx, or nothing answered at all. */
export function linkBroken(l: LinkCheck | undefined): boolean {
  if (!l) return false
  if (l.ok) return false
  return l.status === undefined || l.status === 404 || l.status === 410 || l.status >= 500
}

/** Summary checks for one language (pure). */
export function summaryIssues(s: DigestSummary | undefined, item: DigestCandidate): SummaryIssue[] {
  if (!s || !s.text?.trim()) return ['empty']
  const out: SummaryIssue[] = []
  if (/https?:\/\/|www\./i.test(s.text)) out.push('has_url')
  if ([...s.text].length > SUMMARY_MAX) out.push('too_long')
  // Title is part of the facts, so a number from the title is allowed.
  if (unsupportedNumbers(s.text, candidateFactsText(item)).length) out.push('invented_facts')
  return out
}

/** Decide one item (pure). */
export function verifyItem(item: DigestCandidate, summaries: Partial<Record<DigestLocale, DigestSummary>>, ev: VerifyEvidence): VerifyResult {
  const reasons: RejectReason[] = []
  const now = ev.now.getTime()
  if (!ev.current) reasons.push('gone')
  const cur = ev.current ?? item
  if (!isOpen({ deadline: cur.deadline ?? item.deadline, ends_at: cur.ends_at ?? item.ends_at, starts_at: cur.starts_at ?? item.starts_at, group: item.group }, ev.now)) reasons.push('closed')
  if ((item.group === 'news' || item.group === 'learn') && Date.parse(item.published_at) < now - ev.maxAgeDays * DAY) reasons.push('stale')
  if (!item.title.trim() || !/^https?:\/\//.test(item.url)) reasons.push('missing_facts')
  else if (item.group === 'events' && !item.starts_at && !item.deadline && !item.ends_at) reasons.push('missing_facts')
  if (linkBroken(ev.link)) reasons.push('broken_link')
  if (ev.verified.some((v) => v.key !== item.key && isNearDuplicate(v, item))) reasons.push('duplicate')
  const closingSoon = !!item.deadline && Date.parse(item.deadline) - now < 2 * DAY
  if (ev.recentKeys.has(item.key) && !closingSoon) reasons.push('repeat')
  if (ev.flagged) reasons.push('flagged')
  const summary_issues: VerifyResult['summary_issues'] = {}
  for (const [lang, s] of Object.entries(summaries) as [DigestLocale, DigestSummary][]) {
    const issues = summaryIssues(s, item)
    if (issues.length) summary_issues[lang] = issues
  }
  return { key: item.key, ok: reasons.length === 0, reasons: [...new Set(reasons)], summary_issues }
}

/**
 * When every link check failed without any HTTP answer, the server has no
 * outbound network (or the checker is down): don't reject the whole digest
 * for it. Pure.
 */
export function linkCheckerUnavailable(checks: readonly LinkCheck[]): boolean {
  return checks.length >= 3 && checks.every((c) => !c.ok && c.status === undefined)
}

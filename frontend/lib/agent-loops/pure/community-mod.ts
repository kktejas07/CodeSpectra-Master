/**
 * Community moderator loop — pure decisions (client-safe, tested).
 *
 * Every new visible forum post gets one verdict:
 *   clear_spam  the same link-carrying text posted several times, or a
 *               link-heavy post from a brand-new account → hidden (when the
 *               admin allows auto-hide) or proposed for hiding
 *   review      prompt-injection text, profanity, shouting, duplicates, link
 *               heavy from an older account → a report in the moderators' queue
 *   ok          nothing to do
 * Only clear spam is ever hidden without a person.
 */
import type { SpamSignal } from '@/lib/community/pure'

export interface PostSignals {
  spam: readonly SpamSignal[]
  /** Posts with the same text hash in the last 24 h (all authors, this one included). */
  duplicates: number
  links: number
  accountAgeDays: number
  /** Prompt-guard reasons on the text. */
  injection: readonly string[]
  profanityHits: number
}

export type Verdict = { verdict: 'clear_spam' | 'review' | 'ok'; reasons: string[] }

export function classifyPost(s: PostSignals): Verdict {
  const reasons: string[] = []
  const newAccount = s.accountAgeDays < 3
  const linkHeavy = s.spam.includes('link_heavy')
  if ((s.duplicates >= 3 && s.links >= 1) || s.duplicates >= 5) reasons.push('repeated_posts')
  if (linkHeavy && newAccount) reasons.push('new_account_links')
  if (reasons.length) return { verdict: 'clear_spam', reasons }
  if (s.injection.length) reasons.push('prompt_injection')
  if (s.profanityHits > 0) reasons.push('profanity')
  for (const sig of s.spam) reasons.push(sig)
  if (s.duplicates >= 2 && !reasons.includes('duplicate')) reasons.push('duplicate')
  return { verdict: reasons.length ? 'review' : 'ok', reasons: [...new Set(reasons)] }
}

/** Report reason for the moderators' queue. */
export function reportReasonFor(reasons: readonly string[]): 'spam' | 'abuse' | 'other' {
  if (reasons.includes('profanity')) return 'abuse'
  if (reasons.some((r) => ['link_heavy', 'duplicate', 'repeated_chars', 'shouting', 'repeated_posts', 'new_account_links'].includes(r))) return 'spam'
  return 'other'
}

/**
 * Questions worth an answer suggestion: visible, no replies, not solved,
 * between `minHours` and `maxDays` old, oldest first.
 */
export function unansweredQuestions<T extends { kind: string; status: string; reply_count: number; accepted_reply_id: string | null; created_at: string }>(threads: readonly T[], now: Date, minHours = 6, maxDays = 7): T[] {
  return threads.filter((t) => {
    const age = now.getTime() - Date.parse(t.created_at)
    return t.kind === 'question' && t.status === 'visible' && t.reply_count === 0 && !t.accepted_reply_id && age >= minHours * 3_600_000 && age <= maxDays * 86_400_000
  }).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/**
 * One scan list from new threads and replies (AGT-037): merged oldest first
 * (ties by id). Both queries fetch `limit` rows each, so the first `limit`
 * entries of this list hold every fetched post older than the last of them;
 * the caller scans at most `limit` and moves its cursor only to the last post
 * it actually scanned (nextScanCursor), never past posts it did not look at.
 */
export function mergeScanList<T extends { at: string; id: string }>(threads: readonly T[], replies: readonly T[]): T[] {
  return [...threads, ...replies].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Cursor after scanning the first `scanned` posts of the merged list (pure):
 * the newest scanned timestamp, unless an unscanned post shares it (the next
 * run's `created_at > cursor` query would skip that one) — then the last
 * strictly older scanned timestamp. Never moves back before `since`.
 */
export function nextScanCursor(list: readonly { at: string }[], scanned: number, since: string): string {
  if (scanned <= 0) return since
  const last = list[scanned - 1].at
  let at = last
  if (list.slice(scanned).some((p) => p.at === last)) {
    at = since
    for (let i = scanned - 1; i >= 0; i--) if (list[i].at < last) { at = list[i].at; break }
  }
  return at > since ? at : since
}

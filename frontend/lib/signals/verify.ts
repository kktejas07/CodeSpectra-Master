/**
 * News fact verifier (AGT-031, pure, no I/O) — the step between the AI rewrite and a trusted
 * auto-publish, like the digest verifier (lib/digest/verify).
 *
 * Every number (dates, money, counts), proper noun / organisation name and selling claim in the
 * drafted title, excerpt and body must be backed by the source text (the fetched pages, feed
 * title + summary, the publisher's og: description) or by an extracted fact the pages back —
 * a fact the extraction model made up is not evidence (AGT-039). A draft that fails is kept as
 * `pending` with the issues on `fact_check`, so an admin reviews it instead of it going live.
 */
import { checkFacts, unsupportedNames, unsupportedNumbers, type FactCheck } from '@/lib/ai/fact-check'
import type { SignalFactStored } from '@/lib/db/signal-drafts'

export interface SignalFactCheck extends FactCheck {
  checked_at: string
  /** Extracted facts dropped because a number / name in them is not in the fetched pages (AGT-039). */
  ungrounded?: string[]
}

type Evidence = { facts?: readonly SignalFactStored[] | null; sourceTitle?: string; sourceSummary?: string; pageTitle?: string; pageDescription?: string; sourceText?: string | null }

const groundText = (e: Evidence) => [e.sourceText, e.sourceTitle, e.pageTitle, e.sourceSummary, e.pageDescription].filter((t): t is string => !!t && !!t.trim()).join('\n')

/**
 * The extracted facts the fetched pages actually back (AGT-039): a fact whose
 * numbers or names do not appear in the page text / feed text was made up at
 * extraction and is dropped, so the article can't lean on it. Pure.
 */
export function groundFacts<F extends SignalFactStored>(facts: readonly F[] | null | undefined, e: Evidence): { kept: F[]; dropped: F[] } {
  const src = groundText(e)
  const kept: F[] = []
  const dropped: F[] = []
  for (const f of facts || []) {
    const claim = String(f?.claim || '')
    if (!claim) continue
    if (src && (unsupportedNumbers(claim, src).length || unsupportedNames(claim, src).length)) dropped.push(f)
    else kept.push(f)
  }
  return { kept, dropped }
}

/** Article HTML as plain text: tags out, entities decoded, the "Source" link label dropped. Pure. */
export function articleText(html: string): string {
  return String(html || '')
    .replace(/<a\b[^>]*>\s*Source\s*<\/a>/gi, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    // Block ends start a new "sentence" (a heading followed by a paragraph is not one sentence).
    .replace(/<\/(?:h[1-6]|p|li|blockquote|div|td|th|figcaption)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/**
 * Everything the rewrite was allowed to rely on, as one text: the fetched page
 * text and feed text, plus only the extracted facts those pages back. Pure.
 */
export function signalEvidenceText(e: Evidence): string {
  const lines: string[] = []
  for (const t of [e.sourceTitle, e.pageTitle, e.sourceSummary, e.pageDescription, e.sourceText]) if (t && t.trim()) lines.push(t.trim())
  for (const f of groundFacts(e.facts, e).kept) {
    if (f?.claim) lines.push(String(f.claim))
    if (f?.date) {
      lines.push(String(f.date))
      const d = new Date(String(f.date))
      if (!Number.isNaN(d.getTime())) lines.push(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))
    }
  }
  return lines.join('\n')
}

/** Check the AI draft against its evidence. Pure. */
export function verifySignalDraft(
  draft: { title: string; excerpt: string; body: string },
  evidence: Parameters<typeof signalEvidenceText>[0],
  now: Date = new Date(),
): SignalFactCheck {
  const facts = signalEvidenceText(evidence)
  const headings = [...String(draft.body || '').matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((m) => articleText(m[1]))
  const bodyNoHeadings = String(draft.body || '').replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, '\n')
  const prose = [draft.excerpt, articleText(bodyNoHeadings)].filter(Boolean).join('\n')
  const main = checkFacts(prose, facts)
  // Headlines and sub-headings are often Title Case ("Go 1.25 Brings Faster Builds"), so they get the
  // number and claim checks only; a name in them is checked where the prose repeats it.
  const head = checkFacts([draft.title, ...headings].filter(Boolean).join('\n'), facts)
  const numbers = [...new Set([...head.numbers, ...main.numbers])]
  const claims = [...new Set([...head.claims, ...main.claims])]
  const ungrounded = groundFacts(evidence.facts, evidence).dropped.map((f) => String(f.claim).slice(0, 200))
  return { ok: !numbers.length && !main.names.length && !claims.length, numbers, names: main.names, claims, checked_at: now.toISOString(), ...(ungrounded.length ? { ungrounded } : {}) }
}

/** One-line reason for the admin queue. Pure. */
export function factCheckSummary(fc: Pick<FactCheck, 'numbers' | 'names' | 'claims'>): string {
  const parts: string[] = []
  if (fc.numbers.length) parts.push(`numbers: ${fc.numbers.slice(0, 5).join(', ')}`)
  if (fc.names.length) parts.push(`names: ${fc.names.slice(0, 5).join(', ')}`)
  if (fc.claims.length) parts.push(`claims: ${fc.claims.slice(0, 5).join(', ')}`)
  return parts.join(' · ')
}

/**
 * Phase-3 prompt-injection scanner — pure function, no deps, no LLM.
 *
 * Log-only mode: callers record `reasons` in the usage log but NEVER block
 * the request (blocking on heuristics creates false-positive outages).
 *
 * False-positive controls (deliberate):
 * - Every text pattern is a multi-word phrase with word boundaries — the bare
 *   word "system" (e.g. "operating system", "system design") never matches.
 * - "send to http" only flags when the object is stolen data (transcript,
 *   system prompt, api key, …), NOT "send a request to https://api…".
 * - Bare URLs never match — the exfil patterns require a theft verb +
 *   a sensitive object or an explicit webhook/transcript target.
 * - Structural heuristics (fences, headings, base64) need high counts /
 *   decodable payloads, so normal markdown + short tokens pass.
 */

export interface PromptScan {
  flagged: boolean
  reasons: string[]
}

// ─── 1. System-prompt extraction ────────────────────────────────────────────
// ponytail: one OR-regex per category, not one mega-regex — readable + each
// reason string names the exact sub-pattern that fired for the log.

const EXTRACTION_PATTERNS: { reason: string; re: RegExp }[] = [
  { reason: 'extraction:ignore-previous-instructions', re: /ignor(e|ing)\s+(all\s+)?(previous|prior)\s+instructions/i },
  { reason: 'extraction:disregard-prior', re: /disregard\s+(all\s+)?(prior|previous)\s+(instructions|prompts|rules|directives)/i },
  { reason: 'extraction:forget-instructions', re: /forget\s+(all\s+)?(your|prior|previous)\s+(instructions|rules|directives)/i },
  { reason: 'extraction:reveal-system-prompt', re: /reveal\s+(your\s+|the\s+)?(system|initial|original)\s+(prompt|instructions)/i },
  { reason: 'extraction:show-system-prompt', re: /show\s+me\s+your\s+(system|initial|hidden)\s+(prompt|instructions)/i },
  { reason: 'extraction:what-is-system-prompt', re: /what(?:'s|’s|\s+is)\s+(your|the)\s+(system|initial|hidden)\s+(prompt|instructions)/i },
  { reason: 'extraction:repeat-system-prompt', re: /repeat\s+(your|the)\s+(system|initial)\s+(prompt|instructions)/i },
  { reason: 'extraction:output-system-prompt', re: /(print|output|dump|display)\s+(your|the)\s+(system|initial)\s+(prompt|instructions)/i },
  { reason: 'extraction:override-safety', re: /overrid(e|ing)\s+(your|prior|previous|all|the)\s+(instructions|safety|guardrails|restrictions)/i },
  { reason: 'extraction:bypass-safety', re: /bypass\s+(your\s+|the\s+)?(safety|guardrails|filters|restrictions|content\s+policy)/i },
]

// ─── 2. Role hijack ─────────────────────────────────────────────────────────

const ROLE_HIJACK_PATTERNS: { reason: string; re: RegExp }[] = [
  { reason: 'role-hijack:you-are-now', re: /you\s+are\s+now\b/i },
  { reason: 'role-hijack:from-now-on', re: /from\s+now\s+on,?\s+you\s+are\b/i },
  { reason: 'role-hijack:no-longer', re: /you\s+are\s+no\s+longer\b/i },
  { reason: 'role-hijack:pretend', re: /pretend\s+(you\s+are|to\s+be)\b/i },
  { reason: 'role-hijack:act-as-dan', re: /\bact\s+as\s+DAN\b/i },
  { reason: 'role-hijack:dan-mode', re: /\bDAN\s+mode\b/i },
  // "developer mode" alone is benign (phone/browser settings) — only flag
  // with an activation verb aimed at the assistant.
  { reason: 'role-hijack:mode-activation', re: /(enable|activate|enter|turn\s+on)\s+(developer|DAN|god|jailbreak)\s*mode/i },
  { reason: 'role-hijack:jailbreak', re: /\bjailbreak\b/i },
]

// ─── 3. Exfiltration directives ─────────────────────────────────────────────
// Require theft verb + sensitive object (or explicit webhook/transcript
// target) so "send a POST to https://…" and pasted URLs stay clean.

const EXFIL_PATTERNS: { reason: string; re: RegExp }[] = [
  { reason: 'exfil:transcript-email', re: /email\s+the\s+transcript/i },
  { reason: 'exfil:webhook-post', re: /post\s+to\s+(a\s+)?webhook/i },
  {
    reason: 'exfil:send-sensitive-to-url',
    re: /(send|forward|email|post|upload)\s+(the\s+|this\s+|all\s+|your\s+)?(transcript|conversation|chat\s+history|system\s+prompt|api\s+key|secret|password|token)s?\b.{0,40}\bto\s+\S*https?:/i,
  },
  {
    reason: 'exfil:send-data-to-url',
    re: /\bsend\s+(it|this|everything|all\s+(the\s+)?data)\s+to\s+https?:/i,
  },
  { reason: 'exfil:keyword', re: /\bexfiltrat\w*/i },
]

// ─── 4. Delimiter smuggling ─────────────────────────────────────────────────
// Structural breakouts: fake <system>/<instruction> tags, or walls of fences
// / headings used to re-frame quoted content as new instructions.

const SMUGGLED_TAG_RE = /<\s*\/?\s*(system|instruction|instructions|prompt)\s*>/i
// Normal prompts carry 1–2 fenced blocks (2–4 markers); 8+ is smuggling.
const FENCE_THRESHOLD = 8
// Normal markdown uses a few ### headings; 12+ is structure-spam.
const HEADING_THRESHOLD = 12

// ─── 5. Base64 blobs ────────────────────────────────────────────────────────
// Long b64 runs that decode to mostly-printable text (obfuscated payload).
// 200+ chars per spec; short tokens (hashes, JWTs) never reach the regex.

const B64_RUN_RE = /[A-Za-z0-9+/]{200,}={0,2}/g

function looksLikeTextPayload(decoded: string): boolean {
  if (decoded.length < 50) return false
  let printable = 0
  for (let i = 0; i < decoded.length; i++) {
    const c = decoded.charCodeAt(i)
    if ((c >= 32 && c <= 126) || c === 10 || c === 13 || c === 9) printable++
  }
  return printable / decoded.length > 0.85
}

function decodeBase64(run: string): string | null {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(run, 'base64').toString('utf-8')
    }
    // Non-Node runtimes (edge): atob binary string, no UTF-8 decode.
    if (typeof atob === 'function') {
      return atob(run)
    }
    return null
  } catch {
    return null
  }
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0
  let i = 0
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n++
    i += needle.length
  }
  return n
}

function countHeadingLines(text: string): number {
  let n = 0
  for (const line of text.split('\n')) {
    if (/^\s*#{3,}\s+\S/.test(line)) n++
  }
  return n
}

/**
 * Scan user-supplied prompt text for injection attempts.
 * Pure + total: accepts unknown input, never throws.
 */
export function scanPrompt(text: unknown): PromptScan {
  const reasons: string[] = []
  if (typeof text !== 'string' || text.length === 0) return { flagged: false, reasons }
  // Cap scan cost: patterns are linear, but bound absurd inputs anyway.
  // ponytail: slice, don't reject — over-long prompts are a cost problem,
  // not a scan problem, and truncating keeps this O(1)-ish.
  const input = text.length > 50_000 ? text.slice(0, 50_000) : text

  for (const p of EXTRACTION_PATTERNS) {
    if (p.re.test(input)) reasons.push(p.reason)
  }
  for (const p of ROLE_HIJACK_PATTERNS) {
    if (p.re.test(input)) reasons.push(p.reason)
  }
  for (const p of EXFIL_PATTERNS) {
    if (p.re.test(input)) reasons.push(p.reason)
  }

  if (SMUGGLED_TAG_RE.test(input)) reasons.push('smuggling:fake-tag')

  const fences = countOccurrences(input, '```')
  if (fences >= FENCE_THRESHOLD) reasons.push(`smuggling:excessive-fences(${fences})`)

  const headings = countHeadingLines(input)
  if (headings >= HEADING_THRESHOLD) reasons.push(`smuggling:excessive-headings(${headings})`)

  if (typeof input === 'string') {
    B64_RUN_RE.lastIndex = 0
    let m: RegExpExecArray | null
    // Check at most a few runs — one decodable payload is enough to flag.
    let checked = 0
    while ((m = B64_RUN_RE.exec(input)) !== null && checked < 5) {
      checked++
      const run = m[0]
      if (run.length % 4 === 1) continue // invalid b64 length, skip
      const decoded = decodeBase64(run)
      if (decoded && looksLikeTextPayload(decoded)) {
        reasons.push(`smuggling:base64-payload(${run.length}chars)`)
        break
      }
    }
  }

  return { flagged: reasons.length > 0, reasons }
}

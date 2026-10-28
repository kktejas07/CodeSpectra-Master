/**
 * CSP violation reports (POST /api/csp-report) → compact, redacted log lines.
 *
 * Accepts both formats browsers send:
 *  - `report-uri` (application/csp-report): { "csp-report": { "document-uri", "violated-directive", … } }
 *  - `report-to` / Reporting API (application/reports+json): [{ type: "csp-violation", body: { documentURL, effectiveDirective, … } }]
 *
 * Redaction: URLs keep origin + path only (no query or fragment — tokens,
 * emails and codes live there), opaque path segments (signed links, ids) are
 * replaced with ":id", and script samples are dropped (they can contain page
 * content). Pure: no I/O.
 */

export interface CspViolation {
  directive: string
  blocked: string
  document: string
  source?: string
  line?: number
  disposition: 'enforce' | 'report'
}

const MAX_REPORTS = 20

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined)

/** Path segment that looks like an id / token / signed value. */
function opaque(seg: string): boolean {
  // Long random-looking values (signed links, base64url tokens) — slugs like
  // "how-binary-search-works" have few or no digits and stay readable.
  if (seg.length >= 16 && /^[A-Za-z0-9_\-.~%]+$/.test(seg) && (seg.match(/\d/g)?.length ?? 0) >= 4) return true
  if (/^[0-9a-f]{8,}$/i.test(seg)) return true
  if (/^\d{4,}$/.test(seg)) return true
  return /[@]/.test(seg)
}

export function redactPath(pathname: string): string {
  return pathname.split('/').map((s) => (s && opaque(s) ? ':id' : s)).join('/').slice(0, 160) || '/'
}

/** URL → origin + redacted path; CSP keywords (inline, eval, data, blob, self) pass through. */
export function redactUrl(raw: unknown, mode: 'full' | 'origin' = 'full'): string {
  const v = str(raw, 2000).trim()
  if (!v) return ''
  if (/^(inline|eval|wasm-eval|trusted-types-policy|trusted-types-sink|self|data|blob|about|filesystem|mediastream)$/i.test(v)) return v.toLowerCase()
  if (/^(data|blob|about|filesystem|mediastream):/i.test(v)) return v.split(':')[0].toLowerCase()
  try {
    const u = new URL(v)
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'ws:' && u.protocol !== 'wss:') return u.protocol.replace(':', '')
    return mode === 'origin' ? u.origin : `${u.origin}${redactPath(u.pathname)}`
  } catch {
    return v.startsWith('/') ? redactPath(v.split(/[?#]/)[0]) : 'invalid'
  }
}

function directiveOf(v: unknown): string {
  const d = str(v, 60).trim().split(/\s+/)[0] || ''
  return /^[a-z-]+$/.test(d) ? d : 'unknown'
}

function fromLegacy(r: Record<string, unknown>): CspViolation {
  return {
    directive: directiveOf(r['effective-directive'] || r['violated-directive']),
    blocked: redactUrl(r['blocked-uri'], 'origin'),
    document: redactUrl(r['document-uri']),
    source: redactUrl(r['source-file']) || undefined,
    line: num(r['line-number']),
    disposition: r.disposition === 'enforce' ? 'enforce' : 'report',
  }
}

function fromReportingApi(b: Record<string, unknown>): CspViolation {
  return {
    directive: directiveOf(b.effectiveDirective || b.violatedDirective),
    blocked: redactUrl(b.blockedURL, 'origin'),
    document: redactUrl(b.documentURL),
    source: redactUrl(b.sourceFile) || undefined,
    line: num(b.lineNumber),
    disposition: b.disposition === 'enforce' ? 'enforce' : 'report',
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Cloudflare's own challenge scripts (Turnstile's about:blank iframe,
 * /cdn-cgi/challenge-platform/…) can't carry our nonce and strict-dynamic
 * disables host allowlisting, so they always report script-src violations.
 * The policy is report-only so Turnstile is unaffected — dropping keeps the
 * endpoint's rate budget for real violations.
 */
function blockedIsChallengeNoise(raw: unknown): boolean {
  return typeof raw === 'string' && /\/cdn-cgi\/challenge-platform\//.test(raw)
}

/** Parsed request body (either format) → at most 20 redacted violations. */
export function parseCspReports(body: unknown): CspViolation[] {
  const out: CspViolation[] = []
  if (isObj(body) && isObj(body['csp-report'])) {
    if (!blockedIsChallengeNoise(body['csp-report']['blocked-uri'])) out.push(fromLegacy(body['csp-report']))
  } else if (Array.isArray(body)) {
    for (const r of body.slice(0, MAX_REPORTS)) {
      if (isObj(r) && r.type === 'csp-violation' && isObj(r.body) && !blockedIsChallengeNoise(r.body.blockedURL)) out.push(fromReportingApi(r.body))
    }
  }
  return out.slice(0, MAX_REPORTS)
}

/** One log line per violation (no user agent, IP, query strings or samples). */
export function formatViolation(v: CspViolation): string {
  const where = v.source ? ` src=${v.source}${v.line !== undefined ? `:${v.line}` : ''}` : ''
  return `[csp] ${v.disposition} ${v.directive} blocked=${v.blocked || '-'} page=${v.document || '-'}${where}`
}

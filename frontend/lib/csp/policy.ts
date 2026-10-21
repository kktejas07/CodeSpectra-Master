/**
 * Content-Security-Policy builder (sent by proxy.ts on every HTML response).
 *
 * Why two strict variants (wave 7, decision recorded in
 * docs/security/07-Security-Inventories.md §5):
 *
 *  - Next.js can only put a nonce on its scripts while rendering a request
 *    (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md),
 *    so a nonce CSP would force every page dynamic and undo ISR. Experimental
 *    SRI covers external chunks only: the inline RSC payload scripts
 *    (`self.__next_f.push`) on a prerendered page still need 'unsafe-inline'.
 *  - So: public marketing / content pages (lib/seo/public-routes →
 *    isPublicMarketingPath), which are static or ISR and carry no user data,
 *    get the "static" policy — no 'unsafe-eval', scripts only from 'self' and
 *    the allow-listed third-party origins, inline scripts allowed (required by
 *    the prerendered RSC payload).
 *  - Every other page (dashboard, auth, test taking, token links) is rendered
 *    per request (`dynamic = 'force-dynamic'`, guarded by
 *    tests/csp-dynamic-routes.test.ts) and gets the "nonce" policy:
 *    'nonce-…' + 'strict-dynamic', no 'unsafe-inline', no 'unsafe-eval'.
 *    Next attaches the nonce to its own scripts; our two pre-hydration inline
 *    scripts are allowed by hash (lib/csp/inline-scripts.ts); scripts that our
 *    code inserts (Turnstile, Razorpay, Monaco, analytics tags) are trusted via
 *    'strict-dynamic'.
 *
 * Rollout: CSP_ENFORCE unset/0 (default) → the previous permissive policy stays
 * enforced and the strict one is sent as Content-Security-Policy-Report-Only,
 * reporting to /api/csp-report. CSP_ENFORCE=1 → the strict policy is enforced.
 *
 * Pure and dependency-free so proxy.ts and the tests share it.
 */
import { INLINE_SCRIPT_HASHES } from './inline-scripts'

export type CspMode = 'report-only' | 'enforce'
export type CspVariant = 'static' | 'nonce'

export const CSP_REPORT_PATH = '/api/csp-report'
export const CSP_REPORT_GROUP = 'csp'

export interface TagHosts {
  script: readonly string[]
  connect: readonly string[]
  frame: readonly string[]
}

/** Third-party script origins (inventory: docs/security/07-Security-Inventories.md §5). */
export const SCRIPT_HOSTS = [
  // Monaco editor loader + workers, face-api / pdf.js fallbacks
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com',
  // Firebase Auth (Google sign-in popup / gapi)
  'https://apis.google.com',
  'https://www.gstatic.com',
  // Cloudflare Web Analytics beacon + Turnstile captcha
  'https://static.cloudflareinsights.com',
  'https://challenges.cloudflare.com',
  // Razorpay checkout
  'https://checkout.razorpay.com',
] as const

export const CONNECT_HOSTS = [
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com',
  'https://unpkg.com',
  'https://challenges.cloudflare.com',
  'https://cloudflareinsights.com',
  // Firebase Auth + Realtime Database
  'https://*.googleapis.com',
  'https://*.firebaseio.com',
  'wss://*.firebaseio.com',
  'https://*.firebase.com',
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  // Browser-side AI keys (BYOK features) and GitHub repo checks
  'https://api.anthropic.com',
  'https://generativelanguage.googleapis.com',
  'https://api.github.com',
  // Payments
  'https://*.razorpay.com',
  'https://api.razorpay.com',
  'https://checkout.razorpay.com',
  // Video thumbnails
  'https://i.ytimg.com',
  // Direct-to-bucket uploads / downloads (presigned URLs)
  'https://*.r2.cloudflarestorage.com',
  'https://*.cloudflarestorage.com',
  'https://*.amazonaws.com',
  'https://s3.amazonaws.com',
  'https://storage.googleapis.com',
  'https://*.your-objectstorage.com',
  // LiveKit Cloud (live interviews; self-hosted LiveKit on our origin is 'self')
  'wss://*.livekit.cloud',
  'https://*.livekit.cloud',
] as const

export const FRAME_HOSTS = [
  'https://*.firebaseapp.com',
  'https://checkout.razorpay.com',
  'https://api.razorpay.com',
  'https://www.youtube.com',
  'https://youtube.com',
  'https://www.youtube-nocookie.com',
  'https://challenges.cloudflare.com',
] as const

const STYLE_HOSTS = ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'] as const
const FONT_HOSTS = ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'] as const
const WORKER_HOSTS = ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'] as const

const NO_TAGS: TagHosts = { script: [], connect: [], frame: [] }

const join = (directives: Array<string | null>) => directives.filter(Boolean).join('; ')

/** CSP_ENFORCE=1|true|enforce → enforce; anything else → report-only. */
export function cspMode(value: string | undefined = process.env.CSP_ENFORCE): CspMode {
  const v = (value || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'enforce' ? 'enforce' : 'report-only'
}

/** Base64 nonce from 16 random bytes (Web Crypto: works in the proxy and in tests). */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/**
 * The policy enforced before wave 7 (only additions: LiveKit Cloud and the
 * Cloudflare beacon in connect-src, the Razorpay checkout frame). Still
 * enforced while CSP_ENFORCE is off so production keeps its current
 * protection during the report-only period.
 */
export function legacyCsp(tags: TagHosts = NO_TAGS, storage: string | null = null): string {
  const st = storage ? ` ${storage}` : ''
  const scripts = `'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://apis.google.com https://www.gstatic.com https://*.firebaseio.com https://*.firebase.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://static.cloudflareinsights.com https://challenges.cloudflare.com ${tags.script.join(' ')}`.trim()
  return join([
    "default-src 'self'",
    `script-src ${scripts}`,
    `script-src-elem ${scripts}`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com",
    "font-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https: http:",
    `connect-src 'self' blob: data: ${CONNECT_HOSTS.join(' ')} ${tags.connect.join(' ')}`.trim() + st,
    `frame-src 'self' blob: data: ${FRAME_HOSTS.join(' ')} ${tags.frame.join(' ')}`.trim(),
    "worker-src 'self' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "child-src 'self' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    `media-src 'self' blob: data: https:${st}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
  ])
}

export interface StrictCspOptions {
  variant: CspVariant
  /** Required for the nonce variant. */
  nonce?: string
  dev?: boolean
  tags?: TagHosts
  reportUri?: string
  /** Private-upload bucket origin (lib/csp/storage-origin.ts): presigned PUT + GET. */
  storage?: string | null
}

/** The strict policy (report-only by default, enforced with CSP_ENFORCE=1). */
export function strictCsp(opts: StrictCspOptions): string {
  const tags = opts.tags ?? NO_TAGS
  const dev = !!opts.dev
  const hosts = [...SCRIPT_HOSTS, ...tags.script]
  // React's dev build uses eval for server stack traces; production never does.
  const devEval = dev ? " 'unsafe-eval'" : ''
  let scriptSrc: string
  if (opts.variant === 'nonce') {
    if (!opts.nonce) throw new Error('strictCsp: nonce variant needs a nonce')
    // 'strict-dynamic': hosts below are ignored by CSP3 browsers (kept as the
    // CSP2 fallback); scripts our nonce'd code inserts are trusted.
    // 'wasm-unsafe-eval': face-api (tfjs WASM backend) and the Aadhaar zk prover.
    scriptSrc = `'self' 'nonce-${opts.nonce}' 'strict-dynamic' ${INLINE_SCRIPT_HASHES.join(' ')} 'wasm-unsafe-eval'${devEval} ${hosts.join(' ')}`
  } else {
    // Static / ISR pages: Next's inline RSC payload scripts can't carry a nonce
    // or a stable hash, so inline scripts stay allowed here — but never eval,
    // and external scripts only from 'self' + the allow-list.
    scriptSrc = `'self' 'unsafe-inline' 'wasm-unsafe-eval'${devEval} ${hosts.join(' ')}`
  }
  const report = opts.reportUri ?? CSP_REPORT_PATH
  const st = opts.storage ? ` ${opts.storage}` : ''
  return join([
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // 'unsafe-inline' for styles is required: React `style` props, framer-motion,
    // next/font and Radix positioning all write inline style attributes, and
    // Next has no nonce for style attributes. Script injection is the XSS risk
    // CSP blocks; style-only injection is much lower risk.
    `style-src 'self' 'unsafe-inline' ${STYLE_HOSTS.join(' ')}`,
    `font-src 'self' data: ${FONT_HOSTS.join(' ')}`,
    // Publisher og:images (news, events), avatars and bucket files come from
    // arbitrary HTTPS hosts; plain http images are no longer allowed.
    `img-src 'self' data: blob: https:${st}`,
    `connect-src 'self' blob: data: ${[...CONNECT_HOSTS, ...tags.connect].join(' ')}${st}`,
    `frame-src 'self' blob: ${[...FRAME_HOSTS, ...tags.frame].join(' ')}`,
    `worker-src 'self' blob: ${WORKER_HOSTS.join(' ')}`,
    `media-src 'self' blob: data: https:${st}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    dev ? null : 'upgrade-insecure-requests',
    `report-uri ${report}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ])
}

export interface CspHeaderPlan {
  /** Response headers to set (name → value). */
  response: Record<string, string>
  /**
   * Request header Next reads the nonce from while rendering (never sent to
   * the browser). Only for the nonce variant.
   */
  requestCsp?: string
}

/** Which headers a page response gets for a given mode / variant. */
export function cspHeaders(opts: { mode: CspMode; variant: CspVariant; nonce?: string; dev?: boolean; tags?: TagHosts; storage?: string | null }): CspHeaderPlan {
  const strict = strictCsp({ variant: opts.variant, nonce: opts.nonce, dev: opts.dev, tags: opts.tags, storage: opts.storage })
  const response: Record<string, string> = {
    // Reporting API endpoint for `report-to` (report-uri covers older browsers).
    'Reporting-Endpoints': `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
  }
  if (opts.mode === 'enforce') {
    response['Content-Security-Policy'] = strict
  } else {
    response['Content-Security-Policy'] = legacyCsp(opts.tags, opts.storage)
    response['Content-Security-Policy-Report-Only'] = strict
  }
  return { response, requestCsp: opts.variant === 'nonce' ? strict : undefined }
}

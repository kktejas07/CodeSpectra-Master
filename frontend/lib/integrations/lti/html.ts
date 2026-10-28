/**
 * Minimal HTML documents for the LTI endpoints that render inside the LMS
 * (deep-link picker, auto-post back, launch errors). They are API responses
 * (no app CSP from the proxy), so each sets its own strict policy:
 * nothing external, one nonce'd inline script at most, form posts only to
 * the named origin, framing only by the platform that launched us.
 */
import 'server-only'
import { randomBytes } from 'node:crypto'
import { escapeHtml } from '@/lib/safe-html'
import { matchAcceptLanguage } from '@/lib/i18n/negotiate'
import type { Locale } from '@/lib/i18n/config'

export function requestLocale(req: Request): Locale {
  return matchAcceptLanguage(req.headers.get('accept-language')) ?? 'en'
}

const STYLE = `body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f5fb;color:#0f1729}
main{max-width:640px;margin:0 auto;padding:24px 16px}
h1{font-size:20px;margin:0 0 8px}p{color:#4b5563}
label{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid #e3e7f1;border-radius:12px;background:#fff;margin:8px 0;min-height:44px;cursor:pointer}
input{width:18px;height:18px;margin-top:2px}
button{min-height:44px;padding:0 20px;border:0;border-radius:999px;background:#2F5BE7;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
button:focus-visible,label:focus-within{outline:3px solid #2F5BE7;outline-offset:2px}
@media (prefers-color-scheme:dark){body{background:#0b1020;color:#e6e9f2}p{color:#aab2c5}label{background:#141a2e;border-color:#283152}}`

export function htmlPage(p: { locale: Locale; title: string; body: string; script?: string; formOrigin?: string | null; frameAncestor?: string | null; status?: number }): Response {
  const nonce = randomBytes(16).toString('base64')
  const csp = [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    p.script ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
    `form-action 'self'${p.formOrigin ? ` ${p.formOrigin}` : ''}`,
    `frame-ancestors ${p.frameAncestor || "'none'"}`,
    "base-uri 'none'",
  ].join('; ')
  const html = `<!doctype html><html lang="${p.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(p.title)}</title><style nonce="${nonce}">${STYLE}</style></head><body><main>${p.body}</main>${p.script ? `<script nonce="${nonce}">${p.script}</script>` : ''}</body></html>`
  return new Response(html, { status: p.status ?? 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } })
}

export function originOf(url: string | null | undefined): string | null {
  try { return url ? new URL(url).origin : null } catch { return null }
}

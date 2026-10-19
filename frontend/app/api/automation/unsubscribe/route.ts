/**
 * Signed unsubscribe links in automated emails.
 *   GET  /api/automation/unsubscribe?e=&s=&t=  -> small confirmation page (link scanners can't unsubscribe anyone)
 *   POST /api/automation/unsubscribe            -> form post or RFC 8058 one-click; records the opt-out
 * `s` is the category (engagement, events, assessment, hiring…) or 'all'.
 */
import { NextRequest, NextResponse } from 'next/server'
import { escapeHtmlText } from '@/lib/automation/interpolate'
import { CATEGORY_LABEL, recordUnsubscribe, verifyUnsubscribeToken, type MailCategory } from '@/lib/automation/mailer'
import { normalizeEmail } from '@/lib/automation/outbox'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCOPES = new Set(['all', 'engagement', 'events', 'assessment', 'hiring', 'transactional'])

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtmlText(title)}</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f5fb;color:#0f1729}
main{max-width:480px;margin:48px auto;padding:28px;background:#fff;border:1px solid #e3e7f1;border-radius:16px}
h1{font-size:20px;margin:0 0 12px}p{line-height:1.6;color:#374151}button{background:#2F5BE7;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-weight:600;font-size:15px;cursor:pointer;min-height:44px}
button:focus-visible{outline:3px solid #93a8f5;outline-offset:2px}label{display:flex;gap:8px;align-items:center;margin:12px 0;color:#374151}
@media (prefers-color-scheme:dark){body{background:#0b1020;color:#e6e9f2}main{background:#121a2e;border-color:#25304d}p,label{color:#c3cae0}}</style></head>
<body><main>${body}</main></body></html>`
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
}

function params(sp: URLSearchParams): { email: string | null; scope: string; token: string } {
  return { email: normalizeEmail(sp.get('e')), scope: String(sp.get('s') || ''), token: String(sp.get('t') || '') }
}

export async function GET(req: NextRequest) {
  const { email, scope, token } = params(req.nextUrl.searchParams)
  if (!email || !SCOPES.has(scope) || !verifyUnsubscribeToken(email, scope, token)) {
    return page('Link not valid', '<h1>This link isn’t valid</h1><p>It may have been copied incompletely. You can manage email settings from your account under Notifications.</p>', 400)
  }
  const label = scope === 'all' ? 'all automated emails' : CATEGORY_LABEL[scope as MailCategory] || scope
  const q = new URLSearchParams({ e: email, s: scope, t: token }).toString()
  return page('Unsubscribe', `<h1>Unsubscribe</h1><p>Stop sending <strong>${escapeHtmlText(label)}</strong> to ${escapeHtmlText(email)}?</p>
<form method="post" action="/api/automation/unsubscribe?${escapeHtmlText(q)}">
<label><input type="checkbox" name="all" value="1"> Also stop all other automated emails (billing and security notices still arrive)</label>
<button type="submit">Unsubscribe</button></form>`)
}

export async function POST(req: NextRequest) {
  const { email, scope, token } = params(req.nextUrl.searchParams)
  if (!email || !SCOPES.has(scope) || !verifyUnsubscribeToken(email, scope, token)) return page('Link not valid', '<h1>This link isn’t valid</h1>', 400)
  const rl = await rateLimitRedis(`unsub:${email}`, 20, 60 * 60_000)
  if (!rl.ok) return page('Try again later', '<h1>Please try again later</h1>', 429)
  let all = false
  const ct = req.headers.get('content-type') || ''
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    all = form?.get('all') === '1'
  }
  await recordUnsubscribe(email, scope)
  if (all) await recordUnsubscribe(email, 'all')
  return page('Unsubscribed', `<h1>You’re unsubscribed</h1><p>We won’t send ${all ? 'automated emails' : 'these emails'} to ${escapeHtmlText(email)} any more. Billing and security notices still arrive while you have an account.</p>`)
}

/**
 * One-call Turnstile gate for public forms (newsletter, "notify me", …).
 *
 * Returns null when the request may continue, or a 403 JSON response the
 * route returns as-is. Same policy as lib/captcha/turnstile: enforced only
 * when a Turnstile secret is configured (fresh deploys stay usable), fail
 * closed when it is configured and the token is missing, invalid or
 * Cloudflare can't be reached.
 */
import { NextResponse } from 'next/server'
import { clientIpOrEmpty } from '@/lib/client-ip'
import { isCaptchaConfigured, verifyTurnstileToken } from '@/lib/captcha/turnstile'

type HeaderBag = { get(name: string): string | null }

export async function captchaGate(
  req: { headers: HeaderBag },
  token: unknown,
): Promise<NextResponse | null> {
  if (!(await isCaptchaConfigured())) return null
  const t = typeof token === 'string' ? token.slice(0, 2048) : ''
  if (!t) {
    return NextResponse.json({ error: 'Complete the verification and try again.', code: 'captcha_missing', captcha: 'missing' }, { status: 403 })
  }
  const result = await verifyTurnstileToken(t, clientIpOrEmpty(req) || undefined)
  if (!result.ok) {
    return NextResponse.json({ error: 'Verification failed. Refresh the page and try again.', code: 'captcha_invalid', captcha: 'invalid' }, { status: 403 })
  }
  return null
}

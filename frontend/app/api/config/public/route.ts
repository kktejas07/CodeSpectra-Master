import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Runtime public config.
 *
 * NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time. If the
 * image is built without the Turnstile site key as a build-arg, the shipped
 * bundle has an empty key, the widget renders nothing, and every login/signup
 * fails the enforced captcha with "missing-token". This endpoint reads the
 * value from the RUNTIME environment instead, so the widget always works
 * regardless of build args. Only non-secret, browser-safe values belong here.
 */
export async function GET() {
  return NextResponse.json({
    turnstileSiteKey:
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
      process.env.TURNSTILE_SITE_KEY?.trim() ||
      '',
  })
}

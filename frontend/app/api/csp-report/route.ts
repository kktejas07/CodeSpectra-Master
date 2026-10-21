/**
 * POST /api/csp-report — Content-Security-Policy violation reports
 * (`report-uri` and Reporting API `report-to`; lib/csp/policy.ts).
 *
 * Public by necessity (browsers send no cookies or CSRF token with reports),
 * so: CSRF-exempt (lib/csrf-exempt.ts), its own per-IP rate limit, a 64 KB body
 * cap, and only redacted fields are logged (lib/csp/report.ts). Always 204 —
 * a reporter learns nothing from the response.
 */
import { NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { formatViolation, parseCspReports } from '@/lib/csp/report'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 64 * 1024
const ACCEPTED = /^(application\/(csp-report|reports\+json|json))\b/i

const noContent = () => new NextResponse(null, { status: 204 })

export async function POST(request: Request) {
  const limited = await limitRequest(request, 'csp-report', null, 30, 60_000)
  if (limited) return limited

  const type = request.headers.get('content-type') || ''
  if (!ACCEPTED.test(type)) return noContent()
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > MAX_BYTES) return noContent()

  let text: string
  try {
    text = await request.text()
  } catch {
    return noContent()
  }
  if (text.length > MAX_BYTES) return noContent()

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return noContent()
  }
  // logger.error: production builds strip console.warn/log (next.config removeConsole).
  for (const v of parseCspReports(body)) logger.error(formatViolation(v))
  return noContent()
}

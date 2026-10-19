import { NextRequest, NextResponse } from 'next/server'
import { bodyOf, clientIp, errorResponse, NO_STORE } from '@/lib/ats/bgv/http'
import { caseFromToken, portalView, removeDocument, resendFromExpiredToken, saveCheck, signConsent, submitCase } from '@/lib/ats/bgv/service'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXPIRED = 'This link has expired or was replaced by a newer one.'

/** GET ?token= — public (signed link): the candidate's verification. */
export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, 'ats-bgv-portal-get', null, 60, 60_000)
  if (limited) return limited
  try {
    const c = await caseFromToken(new URL(req.url).searchParams.get('token'))
    if (!c) return NextResponse.json({ error: EXPIRED, code: 'expired' }, { status: 404, headers: NO_STORE })
    return NextResponse.json(await portalView(c), { headers: NO_STORE })
  } catch (e) {
    return errorResponse(e, 'bgv portal get')
  }
}

/**
 * POST { token, action } — public (signed link):
 *   consent         { name, agree, disclosure_ack?, state? }
 *   save            { check, data }        → { errors } when something is invalid
 *   remove_document { document_id }
 *   submit                                  → { missing } when something is still needed
 *   resend                                  → emails a fresh link to the address on file (works on expired links)
 */
export async function POST(req: NextRequest) {
  const b = await bodyOf(req)
  const limited = await limitRequest(req, `ats-bgv-portal-${b.action === 'resend' ? 'resend' : 'post'}`, null, b.action === 'resend' ? 3 : 60, b.action === 'resend' ? 10 * 60_000 : 60_000)
  if (limited) return limited
  try {
    if (b.action === 'resend') {
      await resendFromExpiredToken(b.token)
      // Same answer either way: no oracle for which links exist.
      return NextResponse.json({ ok: true, message: 'If this link belongs to an open verification, we have emailed a new link to the address the hiring team has on file.' }, { headers: NO_STORE })
    }
    const c = await caseFromToken(b.token)
    if (!c) return NextResponse.json({ error: EXPIRED, code: 'expired' }, { status: 404, headers: NO_STORE })
    switch (b.action) {
      case 'consent': {
        const next = await signConsent(c, { name: b.name, agree: b.agree, disclosure_ack: b.disclosure_ack, state: b.state, ip: clientIp(req), userAgent: req.headers.get('user-agent') })
        return NextResponse.json(await portalView(next), { headers: NO_STORE })
      }
      case 'save': {
        const r = await saveCheck(c, b.check, b.data)
        if (r.errors.length) return NextResponse.json({ error: r.errors[0], errors: r.errors }, { status: 400, headers: NO_STORE })
        return NextResponse.json(await portalView(r.case), { headers: NO_STORE })
      }
      case 'remove_document': {
        const next = await removeDocument(c, b.document_id)
        return NextResponse.json(await portalView(next), { headers: NO_STORE })
      }
      case 'submit': {
        const r = await submitCase(c)
        if (Object.keys(r.missing).length) return NextResponse.json({ error: 'A few things are still missing.', missing: r.missing }, { status: 400, headers: NO_STORE })
        return NextResponse.json(await portalView(r.case), { headers: NO_STORE })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers: NO_STORE })
    }
  } catch (e) {
    return errorResponse(e, 'bgv portal post')
  }
}

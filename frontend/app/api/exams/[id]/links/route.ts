/**
 * Assessment share-link records with usage tracking.
 *
 * Replaces the old `?share=true` convention (zero server record — could not
 * expire or revoke) with DB-backed links: `GET /assessment/[id]?link=TOKEN`.
 *
 * POST   /api/exams/[id]/links            — create link (admin/tenant gate)
 * GET    /api/exams/[id]/links            — list links for exam (admin only)
 * GET    /api/exams/[id]/links?token=...  — PUBLIC validate (entry gate);
 *                                           logs usage (IP, UA, timestamp)
 * GET    /api/exams/[id]/links?linkId=... — ADMIN usage logs for a link
 * DELETE /api/exams/[id]/links?linkId=... — revoke (soft; audit retained)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { getAppOrigin } from '@/lib/app-origin'
import type { IdRouteContext } from '@/lib/app-route-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface AssessmentLinkDoc {
  id: string
  exam_id: string
  type: 'public' | 'invited'
  token: string
  expires_at: string | null
  max_uses: number | null
  used_count: number
  revoked: boolean
  created_by: string | null
  created_at: string
}

export interface LinkUsageDoc {
  id: string
  link_id: string
  exam_id: string
  ip_address: string | null
  user_agent: string | null
  device_type: string | null
  browser: string | null
  os: string | null
  user_id: string | null
  user_email: string | null
  user_name: string | null
  accessed_at: string
}

async function linksCol() {
  return (await getMongoDb()).collection<AssessmentLinkDoc>('assessment_links')
}

async function linkUsageCol() {
  return (await getMongoDb()).collection<LinkUsageDoc>('assessment_link_usage')
}

function linkUrl(_req: NextRequest, examId: string, type: string, token: string): string {
  const origin = getAppOrigin()
  return type === 'invited'
    ? `${origin}/assessment/${examId}?inviteToken=${token}`
    : `${origin}/assessment/${examId}?link=${token}`
}

function parseUserAgent(ua: string | null): { device_type: string; browser: string; os: string } {
  if (!ua) return { device_type: 'unknown', browser: 'unknown', os: 'unknown' }
  const lower = ua.toLowerCase()

  let device_type = 'desktop'
  if (/mobile|android|iphone|ipad/i.test(lower)) device_type = /ipad|tablet/i.test(lower) ? 'tablet' : 'mobile'

  let browser = 'unknown'
  if (/edg\//i.test(lower)) browser = 'Edge'
  else if (/chrome/i.test(lower)) browser = 'Chrome'
  else if (/firefox/i.test(lower)) browser = 'Firefox'
  else if (/safari/i.test(lower)) browser = 'Safari'
  else if (/opera|opr\//i.test(lower)) browser = 'Opera'

  let os = 'unknown'
  if (/windows/i.test(lower)) os = 'Windows'
  else if (/mac os/i.test(lower)) os = 'macOS'
  else if (/linux/i.test(lower)) os = 'Linux'
  else if (/android/i.test(lower)) os = 'Android'
  else if (/iphone|ipad|ipod/i.test(lower)) os = 'iOS'

  return { device_type, browser, os }
}

function getClientIp(req: NextRequest): string | null {
  // Trust forwarded headers from reverse proxy (Dokploy/Traefik/Cloudflare)
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp
  return null
}

async function logLinkUsage(
  linkId: string,
  examId: string,
  req: NextRequest,
  userId: string | null,
  userEmail: string | null,
  userName: string | null,
) {
  const ip = getClientIp(req)
  const ua = req.headers.get('user-agent')
  const { device_type, browser, os } = parseUserAgent(ua)

  const doc: LinkUsageDoc = {
    id: newId(),
    link_id: linkId,
    exam_id: examId,
    ip_address: ip,
    user_agent: ua,
    device_type,
    browser,
    os,
    user_id: userId,
    user_email: userEmail,
    user_name: userName,
    accessed_at: nowIso(),
  }
  await (await linkUsageCol()).insertOne(doc).catch(() => {})
}

export async function POST(req: NextRequest, ctx: IdRouteContext) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (gate.user.role !== 'superadmin' && gate.user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: examId } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as {
    type?: string
    expires_at?: string | null
    max_uses?: number | null
    email?: string
    name?: string
  }

  const type = body.type === 'invited' ? 'invited' : 'public'
  const db = await getMongoDb()
  const exam = await db.collection('exams').findOne({ id: examId })
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
  if (gate.user.role === 'tenant_admin' && (!gate.user.tenantId || exam.tenant_id !== gate.user.tenantId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = nowIso()
  const expiresAt = body.expires_at ? new Date(body.expires_at).toISOString() : null
  if (body.expires_at && Number.isNaN(new Date(body.expires_at).getTime())) {
    return NextResponse.json({ error: 'Invalid expires_at' }, { status: 400 })
  }
  const maxUses = body.max_uses == null || body.max_uses === 0 ? null : Math.max(1, Math.floor(Number(body.max_uses) || 0)) || null

  let token = newId()
  if (type === 'invited') {
    const email = (body.email || '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required for invited links' }, { status: 400 })
    }
    token = crypto.randomUUID()
    await db.collection('candidate_invites').insertOne({
      id: newId(),
      token,
      user_id: '',
      email,
      full_name: (body.name || '').trim() || email.split('@')[0],
      target_url: `/assessment/${examId}`,
      assigned_assessments: [],
      allowed_languages: [],
      invited_by: gate.user.id,
      status: 'pending',
      expires_at: expiresAt || new Date(Date.now() + 7 * 86400000).toISOString(),
      created_at: now,
      updated_at: now,
      exam_id: examId,
    })
  }

  const doc: AssessmentLinkDoc = {
    id: newId(),
    exam_id: examId,
    type,
    token,
    expires_at: expiresAt,
    max_uses: maxUses,
    used_count: 0,
    revoked: false,
    created_by: gate.user.id,
    created_at: now,
  }
  await (await linksCol()).insertOne(doc)
  return NextResponse.json({ ...doc, url: linkUrl(req, examId, type, token) }, { status: 201 })
}

export async function GET(req: NextRequest, ctx: IdRouteContext) {
  const { id: examId } = await ctx.params
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const linkId = url.searchParams.get('linkId')

  // Public validate path — the entry gate calls this; the token IS the
  // secret, so no session is required. Logs usage with IP/device/timestamp.
  if (token) {
    const col = await linksCol()
    const link = await col.findOne({ exam_id: examId, token })
    if (!link || link.revoked) {
      return NextResponse.json({ valid: false, error: 'This link has expired or been revoked.' }, { status: 410 })
    }
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ valid: false, error: 'This link has expired.' }, { status: 410 })
    }
    if (link.max_uses != null && link.used_count >= link.max_uses) {
      return NextResponse.json({ valid: false, error: 'This link has reached its usage limit.' }, { status: 410 })
    }
    await col.updateOne({ id: link.id }, { $inc: { used_count: 1 } }).catch(() => {})

    // Log detailed usage (best-effort, non-blocking)
    let userId: string | null = null
    let userEmail: string | null = null
    let userName: string | null = null
    try {
      const gate = await requireAuth().catch(() => null)
      if (gate && !('error' in gate)) {
        userId = gate.user.id
        userEmail = gate.user.email || null
        userName = gate.user.name || null
      }
    } catch { /* anonymous access is fine */ }
    await logLinkUsage(link.id, examId, req, userId, userEmail, userName)

    return NextResponse.json({ valid: true })
  }

  // Admin usage logs path — ?linkId=... returns usage records for that link
  if (linkId) {
    const gate = await requireAuth().catch(() => null)
    if (!gate || 'error' in gate) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (gate.user.role !== 'superadmin' && gate.user.role !== 'tenant_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const usageCol = await linkUsageCol()
    const usage = await usageCol
      .find({ link_id: linkId, exam_id: examId })
      .sort({ accessed_at: -1 })
      .limit(100)
      .toArray()
    return NextResponse.json({ data: usage })
  }

  // List path — admins only (tokens are the URLs, never expose to candidates).
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (gate.user.role !== 'superadmin' && gate.user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const db = await getMongoDb()
  const exam = await db.collection('exams').findOne({ id: examId })
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
  if (gate.user.role === 'tenant_admin' && (!gate.user.tenantId || exam.tenant_id !== gate.user.tenantId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const links = await (await linksCol()).find({ exam_id: examId }).sort({ created_at: -1 }).toArray()
  const origin = getAppOrigin()
  return NextResponse.json({
    data: links.map((l) => ({
      ...l,
      url: l.type === 'invited'
        ? `${origin}/assessment/${examId}?inviteToken=${l.token}`
        : `${origin}/assessment/${examId}?link=${l.token}`,
    })),
  })
}

export async function DELETE(req: NextRequest, ctx: IdRouteContext) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (gate.user.role !== 'superadmin' && gate.user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id: examId } = await ctx.params
  const linkId = new URL(req.url).searchParams.get('linkId')
  if (!linkId) return NextResponse.json({ error: 'linkId required' }, { status: 400 })
  const db = await getMongoDb()
  const exam = await db.collection('exams').findOne({ id: examId })
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
  if (gate.user.role === 'tenant_admin' && (!gate.user.tenantId || exam.tenant_id !== gate.user.tenantId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const col = await linksCol()
  const link = await col.findOne({ id: linkId, exam_id: examId })
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  await col.updateOne({ id: linkId }, { $set: { revoked: true } })
  if (link.type === 'invited') {
    await db.collection('candidate_invites').updateOne(
      { token: link.token },
      { $set: { status: 'expired', expires_at: nowIso() } },
    ).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}

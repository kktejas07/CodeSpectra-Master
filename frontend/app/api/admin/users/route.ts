import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/api-auth'
import { listUsersPage, users, tenants } from '@/lib/db/admin'
import { createCandidateInvite } from '@/lib/services/invites'
import { passwordProblem, tenantScope } from '@/lib/auth-account'
import { issuePasswordSetupLink, accountSetupEmail } from '@/lib/auth-setup-link'
import { auditAdmin } from '@/lib/admin-audit'
import { buildAdminUserRow, type ProfileRow } from '@/lib/admin-users'
import { normalizeUserRole } from '@/lib/rbac'

import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    // tenant_admins see only their own tenant; no tenant ⇒ nothing (never "all").
    const scope = tenantScope(gate.user)
    if (scope.kind === 'none') return NextResponse.json({ users: [], total: 0, page: 1, has_more: false })
    // CORE-019: search, paging and projection happen in MongoDB (was: every user doc, filtered in JS).
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const limit = Math.min(1000, Math.max(1, Number(sp.get('limit')) || 1000))
    const ids = (sp.get('ids') || '').split(',').map((x) => x.trim()).filter((x) => /^[A-Za-z0-9_-]{1,128}$/.test(x))
    const { rows: filtered, total } = await listUsersPage({
      ...(scope.kind === 'tenant' ? { tenantId: scope.tenantId } : {}),
      search: sp.get('search') || sp.get('q'),
      ids: ids.length ? ids : null,
      page,
      limit,
    })

  const rows = filtered.map((u) => {
      const profile: ProfileRow = {
        id: (u.id || (u._id as unknown as string)) || '',
        email: u.email,
        full_name: u.fullName ?? u.name ?? null,
        role: normalizeUserRole(u.role),
        plan: (u as any).plan || 'free',
        created_at:
          typeof u.createdAt === 'string'
            ? u.createdAt
            : u.createdAt?.toISOString?.() ?? new Date().toISOString(),
        updated_at:
          typeof u.updatedAt === 'string'
            ? u.updatedAt
            : u.updatedAt?.toISOString?.() ?? new Date().toISOString(),
        organization_id: (u as any).tenantId ?? (u as any).organizationId ?? null,
      }

      // buildAdminUserRow expects a Supabase User-like object as 1st arg.
      // We pass the minimum shape it reads.
      // Use updatedAt as proxy for last activity when no real last_sign_in_at exists
      const lastActive = u.updatedAt ? 
        (typeof u.updatedAt === 'string' ? u.updatedAt : u.updatedAt?.toISOString?.() ?? null) :
        null

      const fakeAuthUser = {
        id: profile.id,
        email: u.email,
        created_at: profile.created_at,
        last_sign_in_at: lastActive,
        email_confirmed_at: u.emailVerified ? profile.created_at : null,
        user_metadata: { full_name: profile.full_name, role: profile.role },
        app_metadata: {},
      } as unknown as Parameters<typeof buildAdminUserRow>[0]

      const row = buildAdminUserRow(fakeAuthUser, profile)
      ;(row as any).tenant_id = profile.organization_id
      return row
    })

    // Enrich with tenant names (only the caller's own for a tenant admin)
    const tenantCol = await tenants()
    const tenantIds = [...new Set(rows.map((r) => (r as any).tenant_id).filter(Boolean))] as string[]
    const tenantList = tenantIds.length
      ? await tenantCol.find(scope.kind === 'tenant' ? { id: scope.tenantId } : { id: { $in: tenantIds } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()
      : []
    const tenantNameById = new Map(tenantList.map((t) => [t.id, t.name]))

    for (const row of rows) {
      const tid = (row as any).tenant_id
      if (tid) (row as any).tenant_name = tenantNameById.get(tid) || tid
    }

    return NextResponse.json({ users: rows, total, page, has_more: page * limit < total })
  } catch (e: unknown) {
    const msg = 'Failed to list users'
    console.error('[CodeSpectra] admin/users GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/admin/users — two jobs:
 *
 * 1. **Provision** (superadmin, no `target_url` / `assigned_assessments`):
 *    create an account. Refuses an email that already has one (never
 *    overwrites). No password given ⇒ the person gets a set-password link.
 * 2. **Assessment invite** (superadmin or tenant admin): create a single-use
 *    candidate invite. Existing accounts are only *referenced* — password,
 *    id, role and tenant are never touched. Unknown emails get no account:
 *    the invite page sends them to sign up (signup attaches the invite).
 */
export async function POST(request: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: {
    email?: string
    password?: string
    full_name?: string
    role?: string
    tenantId?: string | null
    target_url?: string
    exam_title?: string
    cc_email?: string
    assigned_assessments?: import('@/lib/db/admin').AssessmentStep[]
    allowed_languages?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  const full_name = (typeof body.full_name === 'string' ? body.full_name : '').trim().slice(0, 120) || email.split('@')[0] || 'User'

  const col = await users()
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const existing = await col.findOne({ $or: [{ email }, { email: { $regex: `^${escaped}$`, $options: 'i' } }] } as never)

  const isProvision = gate.user.role === 'superadmin' && body.target_url === undefined && body.assigned_assessments === undefined
  if (isProvision) return provisionAccount(gate.user, body, email, full_name, existing)

  // ── Assessment invite ──────────────────────────────────────────────────
  // Logic shared with the admin agent: lib/services/invites createCandidateInvite.
  try {
    const r = await createCandidateInvite(gate.user, {
      email,
      full_name,
      target_url: body.target_url,
      exam_title: body.exam_title,
      cc_email: body.cc_email,
      assigned_assessments: body.assigned_assessments,
      allowed_languages: body.allowed_languages,
    }, existing as Record<string, unknown> | null)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    const { invite_id: _inviteId, ...payload } = r.data
    void _inviteId
    return NextResponse.json(payload)
  } catch (e: unknown) {
    const msg = 'Failed to create invite'
    console.error('[CodeSpectra] admin/users POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Superadmin "Add user": create a brand-new account (never overwrite one). */
async function provisionAccount(
  actor: { id: string; role: string },
  body: { password?: string; role?: string; tenantId?: string | null },
  email: string,
  full_name: string,
  existing: unknown,
) {
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists. Edit that user instead.' }, { status: 409 })
  }
  const role = normalizeUserRole(body.role)
  let tenantId: string | null = typeof body.tenantId === 'string' && body.tenantId.trim() ? body.tenantId.trim() : null
  let orgName = 'CodeSpectra'
  if (tenantId) {
    const t = await (await tenants()).findOne({ id: tenantId })
    if (!t) return NextResponse.json({ error: 'Organization not found' }, { status: 400 })
    tenantId = t.id
    orgName = t.name || orgName
  }
  // role-scope: the new account's role, not the caller's
  if (role === 'tenant_admin' && !tenantId) {
    return NextResponse.json({ error: 'An organization admin needs an organization.' }, { status: 400 })
  }
  const password = typeof body.password === 'string' && body.password ? body.password : ''
  if (password) {
    const problem = passwordProblem(password)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  }

  try {
    const uid = crypto.randomUUID()
    const now = new Date()
    const col = await users()
    await col.insertOne({
      _id: uid,
      id: uid,
      email,
      name: full_name,
      fullName: full_name,
      ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
      role,
      tenantId,
      emailVerified: false,
      session_version: 1,
      createdAt: now,
      updatedAt: now,
    } as never)

    let emailSent = false
    try {
      const { sendEmail } = await import('@/lib/send-email')
      // role-scope: label for the new account's role
      const roleName = role === 'tenant_admin' ? 'Organization Admin' : role === 'superadmin' ? 'Superadmin' : role === 'judge' ? 'Judge' : 'Team Member'
      if (password) {
        const { emailTemplatesFor } = await import('@/lib/email-templates')
        const { localeForEmail } = await import('@/lib/i18n/recipient')
        const r = await sendEmail(email, emailTemplatesFor(await localeForEmail(email)).accountCredentials({ name: full_name, email, role: roleName, orgName }))
        emailSent = !!r?.success
      } else {
        const hours = 72
        const setupUrl = await issuePasswordSetupLink(uid, hours)
        const r = await sendEmail(email, accountSetupEmail({ name: full_name, orgName, role: roleName, setupUrl, validHours: hours }))
        emailSent = !!r?.success
      }
    } catch (e) {
      console.error('[admin/users] provision email failed:', e)
    }

    await auditAdmin(actor, 'admin.user.create', 'user', `user/${uid}`, `email=${email} role=${role} tenant=${tenantId ?? '-'}`, role === 'user' ? 'info' : 'warning')
    return NextResponse.json({
      user: { id: uid, email, full_name, role, tenant_id: tenantId, created_at: now.toISOString() },
      welcomeEmailSent: emailSent,
      is_existing_user: false,
    }, { status: 201 })
  } catch (e) {
    console.error('[CodeSpectra] admin/users provision:', e)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}

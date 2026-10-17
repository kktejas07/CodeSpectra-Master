import { formatDate } from '@/lib/format-datetime'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getMongoDb } from '@/lib/mongodb'
import { requireAdmin } from '@/lib/api-auth'
import { listAllUsers, users, tenants } from '@/lib/db/admin'
import { checkInviteTargets } from '@/lib/exam-access'
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
    if (scope.kind === 'none') return NextResponse.json({ users: [] })
    const usersList = await listAllUsers(scope.kind === 'tenant' ? { tenantId: scope.tenantId } : {})

    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase()
  const filtered = search
    ? usersList.filter((u) => {
        const name = ((u.fullName ?? u.name ?? '') as string).toLowerCase()
        const email = (u.email || '').toLowerCase()
        return name.includes(search) || email.includes(search)
      })
    : usersList

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
    const tenantList = await tenantCol.find(scope.kind === 'tenant' ? { id: scope.tenantId } : {}).toArray()
    const tenantNameById = new Map(tenantList.map((t) => [t.id, t.name]))

    for (const row of rows) {
      const tid = (row as any).tenant_id
      if (tid) (row as any).tenant_name = tenantNameById.get(tid) || tid
    }

    return NextResponse.json({ users: rows })
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
  const db = await getMongoDb()
  const targetUrl = (typeof body.target_url === 'string' ? body.target_url : '/assessment').trim() || '/assessment'
  const targets = await checkInviteTargets(db, gate.user, { target_url: targetUrl, assigned_assessments: body.assigned_assessments })
  if (!targets.ok) return NextResponse.json({ error: targets.error }, { status: targets.status })

  const allowedLanguages = Array.isArray(body.allowed_languages)
    ? body.allowed_languages.filter((l): l is string => typeof l === 'string').slice(0, 50)
    : []
  const assignedAssessments: import('@/lib/db/admin').AssessmentStep[] =
    Array.isArray(body.assigned_assessments) && body.assigned_assessments.length > 0
      ? body.assigned_assessments
      : [
          {
            id: crypto.randomUUID(),
            title: 'Assigned Assessment',
            target_url: targetUrl,
            type: (targetUrl.includes('cad')
              ? 'cad'
              : targetUrl.includes('identity')
              ? 'identity'
              : targetUrl.includes('problems')
              ? 'coding'
              : 'general') as any,
            allowed_languages: allowedLanguages,
            status: 'pending',
          },
        ]

  try {
    const existingId = existing ? String((existing as { id?: unknown }).id || (existing as { _id: unknown })._id) : null
    const isExistingUser = !!existing

    const { candidateInvites, newId, nowIso } = await import('@/lib/db/admin')

    // Expire old pending invites for same email + exam
    const invitesCol = await candidateInvites()
    await invitesCol.updateMany(
      { email, target_url: targetUrl, status: 'pending' },
      { $set: { status: 'expired', updated_at: nowIso() } }
    )

    // Generate single-use secure candidate invite link
    const inviteId = newId()
    const inviteToken = crypto.randomUUID()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteUrl = `${appUrl}/assessment/invite/${inviteToken}`

    await invitesCol.insertOne({
      id: inviteId,
      token: inviteToken,
      user_id: existingId,
      email,
      full_name,
      target_url: targetUrl,
      ...(targets.examId ? { exam_id: targets.examId } : {}),
      assigned_assessments: assignedAssessments,
      allowed_languages: allowedLanguages,
      invited_by: gate.user.id,
      ...(gate.user.tenantId ? { tenant_id: gate.user.tenantId } : {}),
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: nowIso(),
      delivery_status: 'sending',
    } as never)

    // Send assessment invite email via Postal
    let welcomeEmailSent = false
    let delivery = 'candidate_invite_link'
    try {
      const { sendEmail } = await import('@/lib/send-email')
      const { emailTemplates } = await import('@/lib/email-templates')
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const expiresStr = formatDate(expiresAt, undefined, { month: 'long', day: 'numeric', year: 'numeric' })
      const template = emailTemplates.assessmentInvite({
        candidateName: full_name,
        examTitle: (typeof body.exam_title === 'string' && body.exam_title.slice(0, 200)) || 'Technical Assessment',
        inviteUrl,
        expiresIn: expiresStr,
      })
      const cc = typeof body.cc_email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.cc_email.trim()) ? body.cc_email.trim() : undefined
      const result = await sendEmail(email, template, cc)
      welcomeEmailSent = result.success
      delivery = result.provider

      // Delivery lifecycle: sent (provider accepted) → delivered/opened via
      // Postal webhook; failed when every provider throws. Never left on the
      // initial 'sending' once we know the outcome.
      await invitesCol.updateOne(
        { id: inviteId },
        {
          $set: {
            ...(result.postalMessageId ? { postal_message_id: result.postalMessageId } : {}),
            delivery_status: result.success ? 'sent' : 'failed',
            delivery_updated_at: new Date().toISOString(),
            ...(result.success ? {} : { delivery_error: 'All email providers failed' }),
          },
        }
      )
    } catch {
      // All providers failed — link still returned for manual copy
      await invitesCol.updateOne(
        { id: inviteId },
        {
          $set: {
            delivery_status: 'failed',
            delivery_updated_at: new Date().toISOString(),
            delivery_error: 'All email providers failed',
          },
        }
      ).catch(() => {})
    }

    await auditAdmin(gate.user, 'admin.candidate.invite', 'candidate_invite', `invite/${inviteId}`, `email=${email} target=${targetUrl} existing=${isExistingUser}`)

    const existingCreated = (existing as { createdAt?: unknown } | null)?.createdAt
    return NextResponse.json({
      user: {
        id: existingId,
        email,
        full_name: existing ? ((existing as { fullName?: string; name?: string }).fullName || (existing as { name?: string }).name || full_name) : full_name,
        role: existing ? normalizeUserRole((existing as { role?: string }).role) : 'user',
        tenant_id: existing ? ((existing as { tenantId?: string | null }).tenantId ?? null) : null,
        created_at: existingCreated instanceof Date ? existingCreated.toISOString() : (existingCreated as string | undefined) ?? null,
      },
      invite_url: inviteUrl,
      invite_token: inviteToken,
      target_url: targetUrl,
      welcomeEmailSent,
      delivery,
      is_existing_user: isExistingUser,
    })
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
      const roleName = role === 'tenant_admin' ? 'Organization Admin' : role === 'superadmin' ? 'Superadmin' : role === 'judge' ? 'Judge' : 'Team Member'
      if (password) {
        const { emailTemplates } = await import('@/lib/email-templates')
        const r = await sendEmail(email, emailTemplates.accountCredentials({ name: full_name, email, role: roleName, orgName }))
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

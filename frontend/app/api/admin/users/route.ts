import { formatDate } from '@/lib/format-datetime'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getMongoDb } from '@/lib/mongodb'
import { requireAdmin, requireSuperAdmin } from '@/lib/api-auth'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { listAllUsers, getUserById } from '@/lib/db/admin'
import { buildAdminUserRow, type ProfileRow } from '@/lib/admin-users'
import { normalizeUserRole } from '@/lib/rbac'

import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    // tenant_admins must only see users within their own tenant
    const usersList = await listAllUsers(gate.user.role === 'tenant_admin' ? { tenantId: gate.user.tenantId ?? undefined } : undefined)

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

    // Enrich with tenant names
    const { tenants } = await import('@/lib/db/admin')
    const tenantCol = await tenants()
    const tenantList = await tenantCol.find({}).toArray()
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
 * POST /api/admin/users — provision a new user (superadmin only).
 * Phase 4 migration: uses Better Auth's `signUpEmail` server API to create
 * the user (which handles password hashing + `account` linkage), then
 * upgrades the role/fullName via MongoDB.
 *
 * Welcome-email delivery (previously via Resend/SendGrid in
 * `provisionAdminUser`) is deferred to a later phase.
 */
export async function POST(request: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const adminAuth = await getAdminAuthInstance()
  if (!adminAuth) {
    return NextResponse.json({ error: 'Firebase not configured' }, { status: 500 })
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

  const email = (body.email || '').trim().toLowerCase()
  const full_name = (body.full_name || '').trim() || email.split('@')[0] || 'User'
  // Privilege guard: only superadmins may provision elevated roles or assign an
  // arbitrary tenant. Non-superadmin callers are scoped to plain users in their
  // own tenant (caller-supplied role/tenantId are ignored, not honored).
  let role = normalizeUserRole(body.role)
  let tenantId = body.tenantId && body.tenantId !== '' ? body.tenantId : null
  if (gate.user.role !== 'superadmin') {
    role = 'user'
    tenantId = gate.user.tenantId ?? null
  }
  const targetUrl = (body.target_url || '/assessment').trim()
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
            allowed_languages: body.allowed_languages || [],
            status: 'pending',
          },
        ]
  const allowedLanguages = Array.isArray(body.allowed_languages) ? body.allowed_languages : []

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  try {
    let newUserId: string
    let isExistingUser = false

    // Try to find existing Firebase user first
    try {
      const existingUser = await adminAuth.getUserByEmail(email)
      newUserId = existingUser.uid
      isExistingUser = true
    } catch {
      // User doesn't exist in Firebase — create them
      const password =
        (body.password && body.password.length >= 8 ? body.password : undefined) ||
        `temp-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}A1!`
      const userRecord = await adminAuth.createUser({
        email,
        password,
        displayName: full_name,
      })
      newUserId = userRecord.uid

      const passwordHash = await bcrypt.hash(password, 10)
      const db = await getMongoDb()
      await db.collection('user').updateOne(
        { email },
        {
          $set: {
            id: newUserId,
            email,
            name: full_name,
            fullName: full_name,
            passwordHash,
            role,
            tenantId,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            _id: newUserId,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      )

      const { updateUserById } = await import('@/lib/db/admin')
      await updateUserById(newUserId, { role, fullName: full_name, tenantId })
    }

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
      user_id: newUserId,
      email,
      full_name,
      target_url: targetUrl,
      assigned_assessments: assignedAssessments,
      allowed_languages: allowedLanguages,
      invited_by: gate.user.id,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: nowIso(),
      delivery_status: 'sending',
    })

    const created = isExistingUser ? await getUserById(newUserId) : null

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
        examTitle: body.exam_title || 'Technical Assessment',
        inviteUrl,
        expiresIn: expiresStr,
      })
      const result = await sendEmail(email, template, body.cc_email)
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

    return NextResponse.json({
      user: {
        id: newUserId,
        email,
        full_name,
        role,
        tenant_id: tenantId,
        created_at: created?.createdAt instanceof Date
          ? created.createdAt.toISOString()
          : (created?.createdAt as unknown as string) ?? new Date().toISOString(),
      },
      invite_url: inviteUrl,
      invite_token: inviteToken,
      target_url: targetUrl,
      welcomeEmailSent,
      delivery,
      is_existing_user: isExistingUser,
    })
  } catch (e: unknown) {
    const msg = 'Failed to create user'
    console.error('[CodeSpectra] admin/users POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

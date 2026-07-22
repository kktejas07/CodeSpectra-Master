import { NextResponse } from 'next/server'
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
    const usersList = await listAllUsers()

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
        id: (u._id as unknown as string) || u.id || '',
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

      return buildAdminUserRow(fakeAuthUser, profile)
    })

    return NextResponse.json({ users: rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to list users'
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

  let body: { email?: string; password?: string; full_name?: string; role?: string; target_url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  const full_name = (body.full_name || '').trim() || email.split('@')[0] || 'User'
  const role = normalizeUserRole(body.role)
  const targetUrl = (body.target_url || '/assessment').trim()
  const password =
    (body.password && body.password.length >= 8 ? body.password : undefined) ||
    `temp-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}A1!`

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  try {
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: full_name,
    })
    const newUserId = userRecord.uid

    const { updateUserById, candidateInvites, newId, nowIso } = await import('@/lib/db/admin')
    await updateUserById(newUserId, { role, fullName: full_name })

    const created = await getUserById(newUserId)

    // Generate single-use secure candidate invite link
    const inviteToken = crypto.randomUUID()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteUrl = `${appUrl}/assessment/invite/${inviteToken}`

    const invitesCol = await candidateInvites()
    await invitesCol.insertOne({
      id: newId(),
      token: inviteToken,
      user_id: newUserId,
      email,
      full_name,
      target_url: targetUrl,
      invited_by: gate.user.id,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: nowIso(),
    })

    // Send welcome email if Postal or other provider is configured
    let welcomeEmailSent = false
    let delivery = 'candidate_invite_link'
    try {
      const { sendEmailViaPostal } = await import('@/lib/transactional-mail')
      const { emailTemplates } = await import('@/lib/email-templates')
      const template = emailTemplates.welcomeEmail(full_name)
      await sendEmailViaPostal({
        to: email,
        subject: template.subject,
        html: `${template.html}<p><a href="${inviteUrl}">Click here to start your candidate assessment</a></p>`,
      })
      welcomeEmailSent = true
      delivery = 'postal'
    } catch {
      // Postal not configured or send failed — link still returned for manual copy
    }

    return NextResponse.json({
      user: {
        id: newUserId,
        email,
        full_name,
        role,
        created_at:
          created?.createdAt instanceof Date
            ? created.createdAt.toISOString()
            : (created?.createdAt as unknown as string) ?? new Date().toISOString(),
      },
      invite_url: inviteUrl,
      invite_token: inviteToken,
      target_url: targetUrl,
      welcomeEmailSent,
      delivery,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create user'
    console.error('[CodeSpectra] admin/users POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { tenants, newId, nowIso } from '@/lib/db/admin'
import { getMongoDb } from '@/lib/mongodb'
import { normalizeUserRole } from '@/lib/rbac'
import { passwordProblem } from '@/lib/auth-account'
import { revokeAllUserSessions } from '@/lib/session'
import { issuePasswordSetupLink, accountSetupEmail } from '@/lib/auth-setup-link'
import { auditAdmin } from '@/lib/admin-audit'
import bcrypt from 'bcryptjs'
import { sendEmail } from '@/lib/send-email'
import { emailTemplatesFor } from '@/lib/email-templates'
import { localeForEmail } from '@/lib/i18n/recipient'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const col = await tenants()
    const list = await col.find({}).sort({ created_at: -1 }).toArray()

    const db = await getMongoDb()
    const userCol = db.collection('user')
    const rows = await Promise.all(list.map(async (t) => {
      const memberCount = await userCol.countDocuments({ $or: [{ tenantId: t.id }, { organizationId: t.id }] })
      return { ...t, member_count: memberCount }
    }))

    return NextResponse.json({ data: rows })
  } catch (e: unknown) {
    const msg = 'Failed to list tenants'
    console.error('[CodeSpectra] admin/tenants GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { name?: string; slug?: string; plan?: string; admin_email?: string; admin_name?: string; admin_password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = (body.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'Tenant name is required' }, { status: 400 })
  }

  const adminEmail = (body.admin_email || '').trim().toLowerCase()
  const adminName = (body.admin_name || '').trim()
  const adminPassword = body.admin_password || ''
  if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return NextResponse.json({ error: 'Valid admin email is required' }, { status: 400 })
  }
  if (adminEmail && adminPassword) {
    const problem = passwordProblem(adminPassword)
    if (problem) return NextResponse.json({ error: `Admin ${problem.charAt(0).toLowerCase()}${problem.slice(1)}` }, { status: 400 })
  }

  try {
    const col = await tenants()
    const slugBase = (body.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    let slug = slugBase || `org-${Date.now()}`
    const existing = await col.findOne({ slug })
    if (existing) slug = `${slugBase}-${Date.now().toString(36)}`

    const doc = {
      id: newId(),
      name,
      slug,
      plan: body.plan || 'enterprise',
      is_active: true,
      created_at: nowIso(),
      created_by: gate.user.id,
    }
    await col.insertOne(doc)

    // Optional: provision the org admin user in the same step.
    let admin: { id: string; email: string; role: string; email_failed?: boolean } | null = null
    if (adminEmail) {
      const db = await getMongoDb()
      const userCol = db.collection('user')
      const escaped = adminEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const existingUser = await userCol.findOne({ $or: [{ email: adminEmail }, { email: { $regex: `^${escaped}$`, $options: 'i' } }] })
      const displayName = adminName || adminEmail.split('@')[0] || 'User'

      let adminId: string
      let emailSent = false
      if (existingUser) {
        // Never repurpose a superadmin, or pull an admin out of another org.
        const existingRole = normalizeUserRole(existingUser.role as string | undefined)
        const existingTenant = (existingUser.tenantId as string | null) ?? (existingUser.organizationId as string | null) ?? null
        if (existingRole === 'superadmin' || (existingTenant && existingTenant !== doc.id)) {
          await col.deleteOne({ id: doc.id })
          return NextResponse.json(
            { error: existingRole === 'superadmin' ? 'That email belongs to a superadmin. Use a different admin email.' : 'That email already belongs to another organization.' },
            { status: 409 },
          )
        }
        adminId = existingUser.id || String(existingUser._id)
        await userCol.updateOne(
          { _id: existingUser._id },
          { $set: { tenantId: doc.id, role: 'tenant_admin', updatedAt: new Date() } },
        )
        // Role changed — old sessions must pick up the new role/tenant.
        await revokeAllUserSessions(adminId).catch(() => {})
        try {
          const r = await sendEmail(adminEmail, emailTemplatesFor(await localeForEmail(adminEmail)).accountCredentials({ name: displayName, email: adminEmail, orgName: name, role: 'Organization Admin' }))
          emailSent = !!r?.success
        } catch (e) {
          console.error(`[Tenants] Welcome email to ${adminEmail} failed:`, e)
        }
      } else {
        // Sign-in is local (bcrypt), so no Firebase user is needed. Without an
        // admin-chosen password the admin gets a set-password link — never a
        // random password nobody knows.
        adminId = crypto.randomUUID()
        const now = new Date()
        await userCol.insertOne({
          _id: adminId as never,
          id: adminId,
          email: adminEmail,
          name: displayName,
          fullName: displayName,
          ...(adminPassword ? { passwordHash: await bcrypt.hash(adminPassword, 12) } : {}),
          role: 'tenant_admin',
          tenantId: doc.id,
          emailVerified: false,
          session_version: 1,
          createdAt: now,
          updatedAt: now,
        })
        try {
          if (adminPassword) {
            const r = await sendEmail(adminEmail, emailTemplatesFor(await localeForEmail(adminEmail)).accountCredentials({ name: displayName, email: adminEmail, orgName: name, role: 'Organization Admin' }))
            emailSent = !!r?.success
          } else {
            const hours = 72
            const setupUrl = await issuePasswordSetupLink(adminId, hours)
            const r = await sendEmail(adminEmail, accountSetupEmail({ name: displayName, orgName: name, role: 'Organization Admin', setupUrl, validHours: hours }))
            emailSent = !!r?.success
          }
        } catch (e) {
          console.error(`[Tenants] Welcome email to ${adminEmail} failed:`, e)
        }
      }

      admin = { id: adminId, email: adminEmail, role: 'tenant_admin', ...(emailSent ? {} : { email_failed: true }) }
    }

    await auditAdmin(gate.user, 'admin.tenant.create', 'tenant', `tenant/${doc.id}`, `name=${name}${admin ? ` admin=${admin.email}` : ''}`, 'warning')
    return NextResponse.json({ data: { ...doc, member_count: admin ? 1 : 0 }, admin }, { status: 201 })
  } catch (e: unknown) {
    const msg = 'Failed to create tenant'
    console.error('[CodeSpectra] admin/tenants POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

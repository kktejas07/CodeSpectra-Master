import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { tenants, newId, nowIso } from '@/lib/db/admin'
import { getMongoDb } from '@/lib/mongodb'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import bcrypt from 'bcryptjs'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

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
      const memberCount = await userCol.countDocuments({ tenantId: t.id })
      return { ...t, member_count: memberCount }
    }))

    return NextResponse.json({ data: rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to list tenants'
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
  if (adminEmail && adminPassword && adminPassword.length < 8) {
    return NextResponse.json({ error: 'Admin password must be at least 8 characters' }, { status: 400 })
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
    let admin: { id: string; email: string; role: string } | null = null
    if (adminEmail) {
      const db = await getMongoDb()
      const userCol = db.collection('user')
      const existingUser = await userCol.findOne({ email: adminEmail })

      let adminId: string
      if (existingUser) {
        adminId = existingUser.id || String(existingUser._id)
        // Attach the existing user to the new tenant and promote to org admin.
        await userCol.updateOne(
          { _id: existingUser._id },
          { $set: { tenantId: doc.id, role: 'tenant_admin', updatedAt: new Date() } },
        )
      } else {
        const adminAuth = await getAdminAuthInstance()
        const displayName = adminName || adminEmail.split('@')[0] || 'User'
        if (adminAuth) {
          const rec = await adminAuth.createUser({
            email: adminEmail,
            password: adminPassword && adminPassword.length >= 8 ? adminPassword : `temp-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}A1!`,
            displayName,
          })
          adminId = rec.uid
        } else {
          adminId = `local-${crypto.randomUUID()}`
        }

        const passwordHash = await bcrypt.hash(
          adminPassword && adminPassword.length >= 8 ? adminPassword : `temp-${Math.random().toString(36).slice(2)}A1!`,
          10,
        )
        await userCol.updateOne(
          { email: adminEmail },
          {
            $set: {
              id: adminId,
              email: adminEmail,
              name: displayName,
              fullName: displayName,
              passwordHash,
              role: 'tenant_admin',
              tenantId: doc.id,
              updatedAt: new Date(),
            },
            $setOnInsert: { _id: adminId, createdAt: new Date() },
          },
          { upsert: true },
        )
      }

      admin = { id: adminId, email: adminEmail, role: 'tenant_admin' }

      // Send welcome email with credentials
      const displayName = adminName || adminEmail.split('@')[0] || 'User'
      const emailPassword = adminPassword && adminPassword.length >= 8 ? adminPassword : 'your temporary password'
      try {
        await sendEmail(
          adminEmail,
          emailTemplates.orgAccountProvisioned({
            name: displayName,
            email: adminEmail,
            password: emailPassword,
            orgName: name,
            role: 'Organization Admin',
          }),
        )
      } catch { /* email delivery best-effort */ }
    }

    return NextResponse.json({ data: { ...doc, member_count: admin ? 1 : 0 }, admin }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create tenant'
    console.error('[CodeSpectra] admin/tenants POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

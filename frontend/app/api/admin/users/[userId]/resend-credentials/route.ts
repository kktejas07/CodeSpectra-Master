import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getUserById } from '@/lib/db/admin'
import { sendEmail } from '@/lib/send-email'
import { emailTemplatesFor } from '@/lib/email-templates'
import { localeForEmail } from '@/lib/i18n/recipient'
import { getMongoDb } from '@/lib/mongodb'
import { issuePasswordSetupLink, accountSetupEmail } from '@/lib/auth-setup-link'
import { auditAdmin } from '@/lib/admin-audit'

/**
 * POST /api/admin/users/[userId]/resend-credentials — re-send the "your
 * account is ready" email. Body: { sendPassword?: boolean }.
 * Accounts without a password (or when sendPassword is set) get a
 * set-password link (/auth/reset-password?code=…) instead of being told to
 * use a password nobody gave them.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { userId } = await params
  const user = await getUserById(userId)
  if (!user || !user.email) {
    return NextResponse.json({ error: 'User not found', code: 'user_not_found' }, { status: 404 })
  }

  let body: { sendPassword?: boolean } = {}
  try {
    body = await request.json()
  } catch {}

  const db = await getMongoDb()
  const userRole = user.role || 'user'
  const tenantId = user.tenantId
  let orgName = 'CodeSpectra'
  if (tenantId) {
    const tenantDoc = await db.collection('tenants').findOne({ id: tenantId })
    if (tenantDoc?.name) orgName = tenantDoc.name
  }
  const roleName = userRole === 'tenant_admin' ? 'Organization Admin' : userRole === 'superadmin' ? 'Superadmin' : 'Team Member'
  const name = user.fullName || user.name || user.email.split('@')[0] || 'User'
  const hasPassword = !!(user as unknown as { passwordHash?: string }).passwordHash

  try {
    if (body.sendPassword || !hasPassword) {
      const hours = 72
      const setupUrl = await issuePasswordSetupLink(user._id, hours)
      await sendEmail(user.email, accountSetupEmail({ name, orgName, role: roleName, setupUrl, validHours: hours }))
    } else {
      await sendEmail(user.email, emailTemplatesFor(await localeForEmail(user.email)).accountCredentials({ name, email: user.email, role: roleName, orgName }))
    }
  } catch (e) {
    console.error(`[ResendCredentials] email to ${user.email} failed:`, e)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  await auditAdmin(gate.user, 'admin.user.resend_credentials', 'user', `user/${String(user.id || user._id)}`, body.sendPassword || !hasPassword ? 'set-password link emailed' : 'account email', 'info')
  return NextResponse.json({ ok: true, message: 'Account credentials email sent' })
}

import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getUserById } from '@/lib/db/admin'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import crypto from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import type { Filter } from 'mongodb'

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
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  let body: { sendPassword?: boolean } = {}
  try {
    body = await request.json()
  } catch {}

  const db = await getMongoDb()

  const userRole = (user as any).role || 'user'
  const tenantId = (user as any).tenantId
  let orgName = 'your organization'
  if (tenantId) {
    const tenantDoc = await db.collection('tenants').findOne({ id: tenantId })
    if (tenantDoc?.name) orgName = tenantDoc.name
  }

  const roleName = userRole === 'tenant_admin' ? 'Organization Admin' : userRole === 'superadmin' ? 'Superadmin' : 'Team Member'

  const accountEmail = emailTemplates.accountCredentials({
    name: (user as any).name || (user as any).fullName || (user.email || '').split('@')[0] || 'User',
    email: user.email!,
    role: roleName,
    orgName,
  })

  try {
    const result = await sendEmail(user.email!, accountEmail)
    console.log(`[ResendCredentials] Account info email to ${user.email}: ${result.success ? 'sent' : 'failed'} (${result.provider})`)
  } catch (e) {
    console.error(`[ResendCredentials] Account info email to ${user.email} failed:`, e)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  if (body.sendPassword) {
    const resetToken = crypto.randomBytes(32).toString('hex')
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    await db.collection('user').updateOne(
      { $or: [{ _id: userId }, { id: userId }] } as Filter<any>,
      { $set: { reset_token_hash: hashedToken, reset_token_expires: expiresAt } },
    )

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'}/reset-password?code=${resetToken}`
    const resetEmail = emailTemplates.passwordReset(resetUrl)

    try {
      const resetResult = await sendEmail(user.email!, resetEmail)
      console.log(`[ResendCredentials] Password reset email to ${user.email}: ${resetResult.success ? 'sent' : 'failed'} (${resetResult.provider})`)
    } catch (e) {
      console.error(`[ResendCredentials] Password reset email to ${user.email} failed:`, e)
    }
  }

  return NextResponse.json({ ok: true, message: 'Account credentials email sent' })
}

import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getUserById } from '@/lib/db/admin'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import crypto from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import type { Filter } from 'mongodb'

export async function POST(
  _request: Request,
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

  // Generate password reset token
  const resetToken = crypto.randomBytes(32).toString('hex')
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  const db = await getMongoDb()
  await db.collection('user').updateOne(
    { $or: [{ _id: userId }, { id: userId }] } as Filter<any>,
    { $set: { reset_token_hash: hashedToken, reset_token_expires: expiresAt } },
  )

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'}/reset-password?code=${resetToken}`
  const template = emailTemplates.passwordReset(resetUrl)

  try {
    const result = await sendEmail(user.email!, template)
    console.log(`[ResendCredentials] Password reset email to ${user.email}: ${result.success ? 'sent' : 'failed'} (${result.provider})`)
    return NextResponse.json({ ok: true, message: 'Password reset email sent' })
  } catch (e) {
    console.error(`[ResendCredentials] Email to ${user.email} failed:`, e)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}

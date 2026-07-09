import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || ''

  if (!token || token.length < 16) {
    return redirectWithMessage('Invalid verification link')
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex')
  const db = await getMongoDb()
  const user = await db.collection('user').findOne({
    verification_token_hash: hashedToken,
  })

  if (!user) {
    return redirectWithMessage('Invalid or expired verification link')
  }

  if (user.emailVerified) {
    return redirectWithMessage('Email already verified')
  }

  await db.collection('user').updateOne(
    { email: user.email },
    {
      $set: { emailVerified: true, email_verified_at: new Date().toISOString() },
      $unset: { verification_token_hash: '' },
    },
  )

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.redirect(`${origin}/auth/login?verified=true`)
}

function redirectWithMessage(msg: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.redirect(`${origin}/auth/login?verify_error=${encodeURIComponent(msg)}`)
}

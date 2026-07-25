import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const user = await db.collection('user').findOne(
      { id: gate.user.id },
      { projection: { passwordHash: 0, totp_secret: 0, reset_token_hash: 0, reset_token_expires: 0 } },
    )
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return new NextResponse(JSON.stringify(user, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="codespectra-export.json"',
      },
    })
  } catch (error) {
    console.error('[Export] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

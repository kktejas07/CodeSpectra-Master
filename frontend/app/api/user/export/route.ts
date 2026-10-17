import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { privateFieldsProjection } from '@/lib/auth-account'

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
      // Secrets (TOTP, reset/verification hashes) and the raw face template never leave the server.
      { projection: privateFieldsProjection() },
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

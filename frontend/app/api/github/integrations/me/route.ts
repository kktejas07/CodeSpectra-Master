/**
 * GitHub integration status + disconnect for the current user.
 *   GET    -> { connected, github_login?, github_id?, scope?, connected_at? }
 *   DELETE -> removes the integration row
 */
import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getMongoDb()
  const row = await db.collection('integrations').findOne(
    { provider: 'github', user_id: user.id },
    { projection: { _id: 0, access_token: 0 } },
  )
  if (!row) return NextResponse.json({ connected: false })
  return NextResponse.json({
    connected: true,
    github_login: row.github_login || null,
    github_id: row.github_id || null,
    avatar_url: row.avatar_url || null,
    scope: row.scope || '',
    connected_at: row.created_at || null,
    updated_at: row.updated_at || null,
  })
}

export async function DELETE() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = await getMongoDb()
  await db.collection('integrations').deleteOne({ provider: 'github', user_id: user.id })
  return NextResponse.json({ ok: true, connected: false })
}

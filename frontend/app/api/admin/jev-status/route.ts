import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJevKey } from '@/lib/ai/jev'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — Jev verification availability for the admin results UI.
 * Returns a boolean only; the key itself is never exposed.
 */
export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const key = await readJevKey().catch(() => '')
  return NextResponse.json({ configured: key.length > 0 })
}

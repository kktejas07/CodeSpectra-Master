import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getEbookSettings, saveEbookSettings } from '@/lib/ebooks-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({ auto_draft_enabled: z.boolean() }).strict()

/** GET/PUT /api/resources/ebooks/settings — superadmin: daily AI ebook draft on/off (AUTO-086). */
export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  return NextResponse.json({ settings: await getEbookSettings() })
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  return NextResponse.json({ settings: await saveEbookSettings(parsed.data, gate.user.id) })
}

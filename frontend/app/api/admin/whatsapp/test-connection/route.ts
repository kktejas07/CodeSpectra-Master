import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { checkWhatsAppConnection } from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const status = await checkWhatsAppConnection()
  return NextResponse.json(status, { status: status.ok ? 200 : 400 })
}

export async function GET() {
  return POST()
}
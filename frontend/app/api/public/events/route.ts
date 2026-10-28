import { NextResponse } from 'next/server'
import { listPublicEvents } from '@/lib/hackathons/public-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ items: await listPublicEvents() })
}

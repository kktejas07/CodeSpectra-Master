import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { s3Ping } from '@/lib/s3-storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const result = await s3Ping()
    return NextResponse.json({
      ok: true,
      message: `Connected to ${result.provider} bucket "${result.bucket}" at ${result.endpoint}. Lesson audio will upload here after generation.`,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}

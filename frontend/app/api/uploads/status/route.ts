/**
 * GET /api/uploads/status — whether large direct uploads are on, and their
 * caps (signed-in users; no bucket details).
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { largeUploadLimits, readStorageConfig } from '@/lib/storage/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const on = !!(await readStorageConfig().catch(() => null))
  const l = largeUploadLimits()
  return NextResponse.json(
    on ? { direct: true, video_max_mb: Math.floor(l.videoBytes / 1048576), file_max_mb: Math.floor(l.fileBytes / 1048576) } : { direct: false },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  )
}

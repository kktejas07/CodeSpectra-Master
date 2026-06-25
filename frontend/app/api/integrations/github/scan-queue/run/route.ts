import { NextRequest, NextResponse } from 'next/server'
import { processGithubScanQueueBatch } from '@/lib/github-queue-worker'

/**
 * GET/POST /api/integrations/github/scan-queue/run
 * Drains `github_webhook_scan_queue` (Phase 3 worker). Protect with
 * `Authorization: Bearer <GITHUB_QUEUE_CRON_SECRET>`.
 *
 * **Schedule on Supabase (recommended):** deploy `supabase/functions/github-scan-queue` and add a
 * **Scheduled Function** in the Supabase Dashboard (or call this URL from `pg_cron` + `pg_net` on your host).
 * Set secrets `GITHUB_QUEUE_CRON_SECRET` and `CODESPECTRA_APP_URL` (public origin of this Next app) on the Edge Function.
 */
function authorize(req: NextRequest): boolean {
  const secret = process.env.GITHUB_QUEUE_CRON_SECRET
  if (!secret?.trim()) return false
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  return token === secret.trim()
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  if (!process.env.GITHUB_QUEUE_CRON_SECRET?.trim()) {
    return NextResponse.json({ error: 'GITHUB_QUEUE_CRON_SECRET not configured' }, { status: 503 })
  }
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = Math.min(10, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 5))
  const results = await processGithubScanQueueBatch(limit)
  return NextResponse.json({ success: true, results })
}

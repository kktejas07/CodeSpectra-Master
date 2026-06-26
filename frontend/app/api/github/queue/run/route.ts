/**
 * POST /api/github/queue/run?max=N
 *
 * Drains up to `max` pending rows from `github_webhook_scan_queue` and runs
 * the AI code-review pipeline for each. Superadmin only; intended to be
 * called by a scheduler (e.g. Vercel Cron) or manually from the admin UI.
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { processGithubScanQueueBatch } from '@/lib/github-queue-worker'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const url = new URL(request.url)
  const max = Number(url.searchParams.get('max') || 5)
  const results = await processGithubScanQueueBatch(max)
  return NextResponse.json({ ok: true, processed: results.length, results })
}

export async function GET(request: Request) {
  return POST(request)
}

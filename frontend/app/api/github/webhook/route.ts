/**
 * POST /api/github/webhook
 * Verifies the `X-Hub-Signature-256` HMAC, persists the raw event into
 * MongoDB (`github_webhook_events`), and enqueues `push` events for the
 * scan worker (`github_webhook_scan_queue`).
 *
 * Configure in GitHub repo → Settings → Webhooks:
 *   - Payload URL : `<APP_URL>/api/github/webhook`
 *   - Content type: application/json
 *   - Secret      : value of env `GITHUB_WEBHOOK_SECRET`
 *   - Events      : "Just the push event" (and `ping` for setup)
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  githubWebhookEvents,
  githubWebhookScanQueue,
  newId,
  nowIso,
} from '@/lib/db/leaderboard'

export const runtime = 'nodejs'

function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!secret) return true
  if (!signatureHeader?.startsWith('sha256=')) return false

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const secret = process.env.GITHUB_WEBHOOK_SECRET || ''

  if (secret) {
    const sig = request.headers.get('x-hub-signature-256')
    if (!verifyGitHubSignature(rawBody, sig, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    payload = { parse_error: true }
  }

  const eventType = request.headers.get('x-github-event') || 'unknown'
  const deliveryId = request.headers.get('x-github-delivery')
  const repo =
    (payload.repository as { full_name?: string } | undefined)?.full_name ?? null
  const ownerLogin =
    (payload.repository as { owner?: { login?: string } } | undefined)?.owner?.login ??
    null
  const action = typeof payload.action === 'string' ? payload.action : null

  try {
    const eventsCol = await githubWebhookEvents()
    await eventsCol.insertOne({
      id: newId(),
      delivery_id: deliveryId,
      event_type: eventType,
      action,
      repository_full_name: repo,
      payload,
      created_at: nowIso(),
    })
  } catch (e) {
    console.error('[CodeSpectra] github_webhook_events insert:', e)
  }

  // Enqueue `push` events (skip branch-deletion pushes).
  if (eventType === 'push' && deliveryId && repo) {
    const ref = typeof payload.ref === 'string' ? payload.ref : null
    const after = typeof payload.after === 'string' ? payload.after : null
    const before = typeof payload.before === 'string' ? payload.before : null
    const isDeletion = !after || after.length < 7 || /^0+$/.test(after)
    if (ref && before && !isDeletion) {
      try {
        const queue = await githubWebhookScanQueue()
        const dup = await queue.findOne({ delivery_id: deliveryId })
        if (!dup) {
          await queue.insertOne({
            id: newId(),
            delivery_id: deliveryId,
            repository_full_name: repo,
            owner_login: ownerLogin,
            ref,
            before_commit_sha: before,
            head_commit_sha: after,
            event_type: 'push',
            status: 'pending',
            attempts: 0,
            created_at: nowIso(),
            updated_at: nowIso(),
          })
        }
      } catch (e) {
        console.error('[CodeSpectra] github_webhook_scan_queue insert:', e)
      }
    }
  }

  // Enqueue `pull_request` events (only opened / synchronize / reopened
  // actions — we don't review closures or label changes).
  if (eventType === 'pull_request' && deliveryId && repo) {
    const action = typeof payload.action === 'string' ? payload.action : ''
    const pr = payload.pull_request as
      | {
          number?: number
          head?: { ref?: string; sha?: string }
          base?: { sha?: string }
        }
      | undefined
    const headSha = pr?.head?.sha
    const baseSha = pr?.base?.sha
    const ref = pr?.head?.ref ? `refs/heads/${pr.head.ref}` : null
    if (
      ['opened', 'reopened', 'synchronize'].includes(action) &&
      pr?.number &&
      headSha &&
      baseSha &&
      ref
    ) {
      try {
        const queue = await githubWebhookScanQueue()
        const dup = await queue.findOne({ delivery_id: deliveryId })
        if (!dup) {
          await queue.insertOne({
            id: newId(),
            delivery_id: deliveryId,
            repository_full_name: repo,
            owner_login: ownerLogin,
            ref,
            before_commit_sha: baseSha,
            head_commit_sha: headSha,
            event_type: 'pull_request',
            pull_request_number: pr.number,
            status: 'pending',
            attempts: 0,
            created_at: nowIso(),
            updated_at: nowIso(),
          })
        }
      } catch (e) {
        console.error('[CodeSpectra] github_webhook_scan_queue PR insert:', e)
      }
    }
  }

  return NextResponse.json({ ok: true, received: eventType })
}

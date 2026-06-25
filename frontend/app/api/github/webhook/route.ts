import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/admin-service-client'

function verifyGitHubSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!secret) {
    return true
  }
  if (!signatureHeader?.startsWith('sha256=')) {
    return false
  }
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

/**
 * POST /api/github/webhook
 * Configure in GitHub repo → Settings → Webhooks: URL `https://<host>/api/github/webhook`, content type JSON,
 * secret = `GITHUB_WEBHOOK_SECRET`. Events: pushes (and `ping` for setup).
 */
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
  const repo = (payload.repository as { full_name?: string } | undefined)?.full_name ?? null
  const ownerLogin =
    (payload.repository as { owner?: { login?: string } } | undefined)?.owner?.login ?? null
  const action = typeof payload.action === 'string' ? payload.action : null

  const supabase = getServiceSupabase()
  if (supabase) {
    const { error } = await supabase.from('github_webhook_events').insert({
      delivery_id: deliveryId,
      event_type: eventType,
      action,
      repository_full_name: repo,
      payload,
    })
    if (error) {
      console.error('[CodeSpectra] github_webhook_events insert:', error.message)
    }
  }

  // Phase 3: enqueue `push` events for a future worker (fetch default branch files → analyze).
  if (supabase && eventType === 'push' && deliveryId && repo) {
    const ref = typeof payload.ref === 'string' ? payload.ref : null
    const after = typeof payload.after === 'string' ? payload.after : null
    const before = typeof payload.before === 'string' ? payload.before : null
    const isDeletion = !after || after.length < 7 || /^0+$/.test(after)
    if (ref && before && !isDeletion) {
      const { data: dup } = await supabase
        .from('github_webhook_scan_queue')
        .select('id')
        .eq('delivery_id', deliveryId)
        .maybeSingle()
      if (!dup) {
        const { error: qErr } = await supabase.from('github_webhook_scan_queue').insert({
          delivery_id: deliveryId,
          repository_full_name: repo,
          owner_login: ownerLogin,
          ref,
          before_commit_sha: before,
          head_commit_sha: after,
          status: 'pending',
        })
        if (qErr) {
          console.error('[CodeSpectra] github_webhook_scan_queue insert:', qErr.message)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, received: eventType })
}

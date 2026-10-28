/**
 * POST /api/workflows/hooks/[id] — public, signed inbound webhook trigger (A-015).
 *
 * Headers: Content-Type: application/json
 *          X-CodeSpectra-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 *          Idempotency-Key: <optional, same key = same run>
 * The body (JSON object, ≤ 64 KB) becomes {{trigger.*}}. Requests older than
 * 5 minutes are refused, and each signed request is accepted ONCE (replay store
 * keyed by workflow + timestamp + signature, TTL). Every auth failure — unknown
 * workflow, bad / stale signature, replay — gets the same 401, so ids can't be
 * probed. Rate limit: 60 / minute per workflow.
 * Answers 202 with the run id; the run continues in the background.
 */
import { NextRequest, NextResponse } from 'next/server'
import type { WorkflowDoc } from '@/lib/db/leaderboard'
import { claimWebhookDelivery, col } from '@/lib/automation/store'
import { DEFAULT_TOLERANCE_SEC, SIGNATURE_HEADER, verifySignature } from '@/lib/automation/hmac'
import { decryptValue } from '@/lib/automation/settings'
import { processRun, startWorkflowRun } from '@/lib/automation/runs'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY = 64_000
// Same answer for "no such workflow" and "bad signature", so ids can't be probed.
const denied = () => NextResponse.json({ error: 'invalid signature' }, { status: 401 })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) return denied()
  const rl = await rateLimitRedis(`workflow-hook:${id}`, 60, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const len = Number(req.headers.get('content-length') || 0)
  if (len > MAX_BODY) return NextResponse.json({ error: 'payload too large' }, { status: 413 })
  const raw = await req.text().catch(() => '')
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'payload too large' }, { status: 413 })

  const wf = (await (await col<WorkflowDoc>('workflows')).findOne({ id }, { projection: { _id: 0 } })) as WorkflowDoc | null
  if (!wf || !wf.webhook_secret_enc) return denied()
  const secret = await decryptValue(wf.webhook_secret_enc)
  if (!secret) return denied()
  const v = verifySignature(secret, raw, req.headers.get(SIGNATURE_HEADER))
  if (!v.ok) return denied()
  if (!(await claimWebhookDelivery(wf.id, v.t, v.sig, DEFAULT_TOLERANCE_SEC))) return denied()
  if (wf.trigger !== 'webhook' || !wf.is_active) return NextResponse.json({ error: 'workflow is not accepting webhooks' }, { status: 409 })

  let payload: unknown
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 })
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return NextResponse.json({ error: 'body must be a JSON object' }, { status: 400 })

  const idem = (req.headers.get('idempotency-key') || '').trim().slice(0, 120)
  const { run, duplicate } = await startWorkflowRun(wf, {
    trigger: 'webhook',
    actorId: 'webhook',
    payload: payload as Record<string, unknown>,
    inline: false,
    ...(idem ? { idempotencyKey: `hook:${wf.id}:${idem}` } : {}),
  })
  if (!duplicate && run.status === 'running') {
    setTimeout(() => {
      void processRun(run.id, wf).catch((e) => console.error('[workflows/hooks] run failed:', e))
    }, 0)
  }
  return NextResponse.json({ ok: true, run_id: run.id, duplicate }, { status: 202 })
}

/**
 * Cron / scheduler overview for superadmins.
 *
 * GET /api/admin/cron-jobs
 *   Reports the state of every job the platform runs:
 *   - in-process scheduler loop (startSchedulerLoop, 60s tick)
 *   - trial expiry loop (startTrialExpiryLoop, 24h)
 *   - HTTP cron entrypoints (/api/cron/tick, weekly-digest, exam-reminders)
 *   - schedule-trigger workflows from the DB
 *   - recent workflow_runs + pending github scan queue items
 *   - CRON_SECRET / Redis lock availability
 *
 * POST /api/admin/cron-jobs
 *   body: { action: 'run-tick' }            -> run one scheduler tick now
 *   body: { action: 'toggle-workflow', workflowId } -> flip is_active
 *   body: { action: 'run-workflow', workflowId }    -> execute a workflow now
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import {
  workflows,
  workflowRuns,
  githubWebhookScanQueue,
  type WorkflowDoc,
} from '@/lib/db/leaderboard'
import { runDueWorkflows } from '@/lib/scheduler'
import { executeWorkflow } from '@/lib/workflow-engine'
import { redisStatus } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HTTP_CRON_ENDPOINTS = [
  { path: '/api/cron/tick', what: 'Scheduler tick — runs due schedule workflows every minute' },
  { path: '/api/cron/weekly-digest', what: 'Weekly digest email to users' },
  { path: '/api/cron/exam-reminders', what: 'Exam start reminders' },
]

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const [wfCol, runsCol, queueCol] = await Promise.all([workflows(), workflowRuns(), githubWebhookScanQueue()])

    const [wfDocs, recentRuns, queuePending, queueTotal, redis] = await Promise.all([
      wfCol.find({ trigger: 'schedule' }).sort({ created_at: -1 }).limit(100).toArray() as Promise<WorkflowDoc[]>,
      runsCol.find({}).sort({ started_at: -1 }).limit(20).toArray(),
      queueCol.countDocuments({ status: { $in: ['pending', 'running'] } }),
      queueCol.countDocuments({}),
      redisStatus(),
    ])

    const schedulerDisabled = process.env.NEXT_PUBLIC_DISABLE_SCHEDULER === '1'

    return NextResponse.json({
      ok: true,
      scheduler: {
        inProcessLoop: !schedulerDisabled,
        disabledEnv: process.env.NEXT_PUBLIC_DISABLE_SCHEDULER ?? null,
        cronSecretSet: Boolean(process.env.CRON_SECRET?.trim()),
        redis: {
          configured: redis.configured,
          connected: redis.connected,
          mode: redis.mode,
          latencyMs: redis.latencyMs ?? null,
          error: redis.error ?? null,
        },
      },
      endpoints: HTTP_CRON_ENDPOINTS.map((e) => ({ ...e })),
      trialExpiryLoop: { enabledByDefault: true, intervalHours: 24 },
      scheduledWorkflows: wfDocs.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description ?? '',
        cron: w.cron_expression ?? '',
        is_active: w.is_active,
        nodes: w.nodes?.length ?? 0,
        created_at: w.created_at,
      })),
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        workflow_id: r.workflow_id,
        status: r.status,
        started_at: r.started_at,
        finished_at: r.finished_at,
        duration_ms: r.duration_ms,
      })),
      queue: {
        pending: queuePending,
        total: queueTotal,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const action = body.action as string | undefined
  const workflowId = typeof body.workflowId === 'string' && body.workflowId.length ? body.workflowId : ''

  try {
    if (action === 'run-tick') {
      const report = await runDueWorkflows(new Date())
      return NextResponse.json({ ok: true, action, report })
    }

    if (action === 'toggle-workflow') {
      const wfCol = await workflows()
      const wf = await wfCol.findOne({ id: workflowId })
      if (!wf) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
      await wfCol.updateOne({ id: wf.id }, { $set: { is_active: !wf.is_active, updated_at: new Date().toISOString() } })
      return NextResponse.json({ ok: true, action, is_active: !wf.is_active })
    }

    if (action === 'run-workflow') {
      const wfCol = await workflows()
      const wf = await wfCol.findOne({ id: workflowId })
      if (!wf) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
      const wfd = wf as unknown as WorkflowDoc
      const started = new Date().toISOString()
      const result = await executeWorkflow(wfd)
      const finished = new Date().toISOString()
      const runDoc = {
        id: crypto.randomUUID(),
        workflow_id: wfd.id,
        user_id: 'admin-manual',
        status: result.status,
        started_at: started,
        finished_at: finished,
        steps: result.steps,
        duration_ms: result.duration_ms,
      }
      await workflowRuns().then((c) => c.insertOne(runDoc as never))
      return NextResponse.json({ ok: true, action, status: result.status, run: runDoc })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
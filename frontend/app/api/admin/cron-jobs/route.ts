/**
 * Cron / scheduler overview for superadmins.
 *
 * GET  /api/admin/cron-jobs  — status of loops, HTTP crons, scheduled workflows, recent runs
 * POST /api/admin/cron-jobs
 *   { action: 'run-tick' }
 *   { action: 'run-endpoint', path: '/api/cron/...' }
 *   { action: 'toggle-workflow', workflowId }
 *   { action: 'run-workflow', workflowId }
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
import { getCronRuns } from '@/lib/cron-heartbeat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Catalog of platform HTTP cron jobs — keep in sync with frontend/app/api/cron/* */
const HTTP_CRON_JOBS = [
  {
    id: 'tick',
    path: '/api/cron/tick',
    name: 'Scheduler tick',
    what: 'Runs due schedule-trigger workflows (every minute).',
    recommend: 'Every 1 minute',
    cronHint: '* * * * *',
    auth: 'CRON_SECRET',
    intervalMinutes: 1,
  },
  {
    id: 'status-check',
    path: '/api/cron/status-check',
    name: 'Status check',
    what: 'Probes dependencies and records public status-page components.',
    recommend: 'Every 5 minutes',
    cronHint: '*/5 * * * *',
    auth: 'CRON_SECRET',
    intervalMinutes: 5,
  },
  {
    id: 'signals-ingest',
    path: '/api/cron/signals-ingest',
    name: 'Signals ingest',
    what: 'Public RSS → research → fact pack → draft → humanize → admin approve queue.',
    recommend: 'Every 6 hours',
    cronHint: '0 */6 * * *',
    auth: 'CRON_SECRET',
    intervalMinutes: 360,
  },
  {
    id: 'weekly-digest',
    path: '/api/cron/weekly-digest',
    name: 'Weekly digest',
    what: 'Sends weekly digest email to users.',
    recommend: 'Monday 09:00 UTC',
    cronHint: '0 9 * * 1',
    auth: 'CRON_SECRET',
    intervalMinutes: 10080,
  },
  {
    id: 'daily-digest',
    path: '/api/cron/daily-digest',
    name: 'Daily digest',
    what: 'Emails opted-in users a summary of their last 24 hours of notifications.',
    recommend: 'Daily 08:00 UTC',
    cronHint: '0 8 * * *',
    auth: 'CRON_SECRET',
    intervalMinutes: 1440,
  },
  {
    id: 'exam-reminders',
    path: '/api/cron/exam-reminders',
    name: 'Exam reminders',
    what: 'Sends exam start reminders (WhatsApp / notifications).',
    recommend: 'Every hour',
    cronHint: '0 * * * *',
    auth: 'CRON_SECRET',
    intervalMinutes: 60,
  },
  {
    id: 'ebooks-daily',
    path: '/api/cron/ebooks-daily',
    name: 'Daily ebook draft',
    what: 'Generates one original CodeSpectra ebook draft (no copyrighted scraping). Publish in Admin → Resources.',
    recommend: 'Daily',
    cronHint: '0 7 * * *',
    auth: 'CRON_SECRET',
    intervalMinutes: 1440,
  },
  {
    id: 'security-scan',
    path: '/api/cron/security-scan',
    name: 'Security scan',
    what: 'Weekly vulnerability scan persisted to the security-scans collection.',
    recommend: 'Weekly (Sunday 03:00 UTC)',
    cronHint: '0 3 * * 0',
    auth: 'CRON_SECRET',
    intervalMinutes: 10080,
  },
] as const

const ALLOWED_RUN_PATHS = new Set(HTTP_CRON_JOBS.map((j) => j.path))

export async function GET() {
  const auth = await requireSuperAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const [wfCol, runsCol, queueCol] = await Promise.all([
      workflows(),
      workflowRuns(),
      githubWebhookScanQueue(),
    ])

    const [wfDocs, recentRuns, queuePending, queueTotal, redis] = await Promise.all([
      wfCol.find({ trigger: 'schedule' }).sort({ created_at: -1 }).limit(100).toArray() as Promise<WorkflowDoc[]>,
      runsCol.find({}).sort({ started_at: -1 }).limit(20).toArray(),
      queueCol.countDocuments({ status: { $in: ['pending', 'running'] } }),
      queueCol.countDocuments({}),
      redisStatus(),
    ])

    // Real last-run evidence (see lib/cron-heartbeat) — "secret is set" is not
    // proof a job runs; this is.
    const runIds = [...HTTP_CRON_JOBS.map((j) => j.id), 'scheduler-loop', 'trial-expiry']
    const runMap = await getCronRuns(runIds)
    const runMeta = (id: string) => {
      const r = runMap[id]
      return {
        lastRunAt: r?.last_run_at ?? null,
        lastStatus: r?.last_status ?? null,
        lastDurationMs: r?.last_duration_ms ?? null,
        lastError: r?.last_error ?? null,
        runs: r?.runs ?? 0,
        failures: r?.failures ?? 0,
      }
    }

    const schedulerDisabled = process.env.NEXT_PUBLIC_DISABLE_SCHEDULER === '1'
    const cronSecretSet = Boolean(process.env.CRON_SECRET?.trim())
    const activeWorkflows = wfDocs.filter((w) => w.is_active).length

    return NextResponse.json({
      ok: true,
      scheduler: {
        inProcessLoop: !schedulerDisabled,
        disabledEnv: process.env.NEXT_PUBLIC_DISABLE_SCHEDULER ?? null,
        cronSecretSet,
        redis: {
          configured: redis.configured,
          connected: redis.connected,
          mode: redis.mode,
          latencyMs: redis.latencyMs ?? null,
          error: redis.error ?? null,
        },
      },
      loops: [
        {
          id: 'scheduler',
          name: 'In-process scheduler',
          what: 'Checks due workflows every 60s while the Next.js server is up.',
          recommend: 'Always on (or hit /api/cron/tick every minute from an external cron)',
          status: schedulerDisabled ? 'disabled' : 'running',
          ...runMeta('scheduler-loop'),
        },
        {
          id: 'trial-expiry',
          name: 'Trial expiry',
          what: 'Expires trial subscriptions once per day.',
          recommend: 'Every 24 hours',
          status: schedulerDisabled ? 'disabled' : 'running',
          ...runMeta('trial-expiry'),
        },
      ],
      httpJobs: HTTP_CRON_JOBS.map((j) => ({
        ...j,
        // External cron must be configured by ops; we only know if the secret exists.
        configured: cronSecretSet,
        status: cronSecretSet ? 'ready' : 'needs_secret',
        ...runMeta(j.id),
      })),
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
      queue: { pending: queuePending, total: queueTotal },
      summary: {
        httpJobs: HTTP_CRON_JOBS.length,
        activeWorkflows,
        totalWorkflows: wfDocs.length,
        cronSecretSet,
        schedulerRunning: !schedulerDisabled,
      },
    })
  } catch (e) {
    console.error('[CRON JOBS GET 500 ERROR]', e)
    const msg = 'Failed to load cron jobs'
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
  const path = typeof body.path === 'string' ? body.path : ''

  try {
    if (action === 'run-tick') {
      const report = await runDueWorkflows(new Date())
      return NextResponse.json({ ok: true, action, report })
    }

    if (action === 'run-endpoint') {
      if (!(ALLOWED_RUN_PATHS as Set<string>).has(path)) {
        return NextResponse.json({ error: 'Unknown cron path' }, { status: 400 })
      }
      const secret = process.env.CRON_SECRET?.trim() || ''
      const origin = new URL(req.url).origin
      // Secret in the Authorization header only — never in the URL (access logs).
      const res = await fetch(`${origin}${path}`, {
        method: 'POST',
        cache: 'no-store',
        headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
      })
      const text = await res.text()
      let data: unknown = text
      try {
        data = JSON.parse(text)
      } catch {
        /* keep text */
      }
      return NextResponse.json(
        { ok: res.ok, action, path, status: res.status, data },
        { status: res.ok ? 200 : 502 },
      )
    }

    if (action === 'toggle-workflow') {
      const wfCol = await workflows()
      const wf = await wfCol.findOne({ id: workflowId })
      if (!wf) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
      await wfCol.updateOne(
        { id: wf.id },
        { $set: { is_active: !wf.is_active, updated_at: new Date().toISOString() } },
      )
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
        status: result.status === 'success' ? 'success' : result.status === 'partial' ? 'partial' : 'failed',
        started_at: started,
        finished_at: finished,
        steps: result.steps.map((s) => ({
          node_id: s.node_id,
          label: s.label,
          ok: s.ok,
          output: s.output,
          error: s.error,
          duration_ms: s.duration_ms,
        })),
        duration_ms: result.duration_ms,
      }
      await workflowRuns().then((c) => c.insertOne(runDoc as never))
      return NextResponse.json({ ok: true, action, status: result.status, run: runDoc })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    console.error('[CRON JOBS POST 500 ERROR]', action, e)
    const msg = 'Cron action failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

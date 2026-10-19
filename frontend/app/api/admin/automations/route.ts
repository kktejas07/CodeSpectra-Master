/**
 * Built-in automations (superadmin).
 *   GET  /api/admin/automations -> automations with on/off, last run, status, last result;
 *                                  queue stats, recent dead letters, config (secrets masked)
 *   POST { action: 'toggle', id, enabled }
 *        { action: 'run', id }                    run a sweep now
 *        { action: 'config', config }             retention / alert channel / WhatsApp templates
 *        { action: 'test-alert' }                 send a test alert
 *        { action: 'unsuppress', email }          allow mail to an address again
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getCronRuns } from '@/lib/cron-heartbeat'
import { auditAdmin } from '@/lib/admin-audit'
import { col } from '@/lib/automation/store'
import { CONFIG_DEFAULTS, getSystemSettings, saveSystemConfig, setAutomationEnabled } from '@/lib/automation/settings'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { SYSTEM_AUTOMATIONS } = await import('@/lib/automation/system/registry')
  const settings = await getSystemSettings(true)
  const beats = await getCronRuns(SYSTEM_AUTOMATIONS.map((a) => `auto:${a.id}`).concat('automations'))
  const windows = await (await col('automation_settings')).find({ key: { $regex: '^window:' } }, { projection: { _id: 0 } }).toArray()
  const winBy = new Map(windows.map((w) => [String(w.key).slice(7), w]))
  const items = SYSTEM_AUTOMATIONS.map((a) => {
    const b = beats[`auto:${a.id}`]
    const w = winBy.get(a.id)
    return {
      id: a.id, title: a.title, description: a.description, group: a.group, refs: a.refs,
      enabled: typeof settings.toggles[a.id] === 'boolean' ? settings.toggles[a.id] : a.defaultOn !== false,
      schedule: a.cadence ? (a.cadence.kind === 'interval' ? `Every ${a.cadence.minutes} min` : a.cadence.kind === 'daily' ? `Daily ${String(a.cadence.hourUtc).padStart(2, '0')}:${String(a.cadence.minuteUtc || 0).padStart(2, '0')} UTC` : `Weekly (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][a.cadence.weekdayUtc]} ${String(a.cadence.hourUtc).padStart(2, '0')}:00 UTC)`) : null,
      triggers: (a.events || []).map((e) => e.type),
      can_run_now: !!a.run,
      last_run_at: b?.last_run_at ?? null,
      last_status: b?.last_status ?? null,
      last_error: b?.last_error ?? null,
      runs: b?.runs ?? 0,
      failures: b?.failures ?? 0,
      last_result: w?.last_result ?? null,
    }
  })
  const db = (await import('@/lib/mongodb')).getMongoDb
  const mdb = await db()
  const [eventsPending, eventsDead, jobsPending, jobsDead, runsWaiting, outboxPending, outboxDead, suppressed, deadLetters] = await Promise.all([
    mdb.collection('automation_events').countDocuments({ status: { $in: ['pending', 'retry', 'processing'] } }),
    mdb.collection('automation_events').countDocuments({ status: 'dead' }),
    mdb.collection('automation_jobs').countDocuments({ status: 'pending' }),
    mdb.collection('automation_jobs').countDocuments({ status: 'dead' }),
    mdb.collection('workflow_runs').countDocuments({ status: 'waiting' }),
    mdb.collection('email_outbox').countDocuments({ status: 'pending' }),
    mdb.collection('email_outbox').countDocuments({ status: 'dead' }),
    mdb.collection('email_suppressions').countDocuments({ active: { $ne: false } }),
    mdb.collection('automation_dead_letters').find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(20).toArray(),
  ])
  const cfg = settings.config
  return NextResponse.json({
    items,
    tick: beats.automations ?? null,
    queues: { eventsPending, eventsDead, jobsPending, jobsDead, runsWaiting, outboxPending, outboxDead, suppressed },
    dead_letters: deadLetters,
    config: {
      ...CONFIG_DEFAULTS,
      ...cfg,
      alert_webhook_url: cfg.alert_webhook_url ? 'set' : null,
      alert_emails: cfg.alert_emails || [],
    },
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'admin:automations', gate.user.id, 60, 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { SYSTEM_AUTOMATIONS, systemAutomationById, runSystemAutomation } = await import('@/lib/automation/system/registry')
  void SYSTEM_AUTOMATIONS

  if (body.action === 'toggle') {
    const a = systemAutomationById(String(body.id || ''))
    if (!a) return NextResponse.json({ error: 'Unknown automation' }, { status: 404 })
    const enabled = body.enabled === true
    await setAutomationEnabled(a.id, enabled, gate.user.id)
    await auditAdmin(gate.user, enabled ? 'automation.enable' : 'automation.disable', 'automation', a.id, a.title, enabled ? 'info' : 'warning')
    return NextResponse.json({ ok: true, id: a.id, enabled })
  }
  if (body.action === 'run') {
    const a = systemAutomationById(String(body.id || ''))
    if (!a?.run) return NextResponse.json({ error: 'This automation has no sweep to run' }, { status: 400 })
    await auditAdmin(gate.user, 'automation.run', 'automation', a.id, a.title)
    const r = await runSystemAutomation(a, new Date())
    return NextResponse.json(r, { status: r.ok ? 200 : 500 })
  }
  if (body.action === 'config') {
    const cfg = body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? (body.config as Record<string, unknown>) : null
    if (!cfg) return NextResponse.json({ error: 'config required' }, { status: 400 })
    const errors = await saveSystemConfig(cfg, gate.user.id)
    if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 400 })
    await auditAdmin(gate.user, 'automation.config', 'automation', 'system', Object.keys(cfg).join(', '), 'warning')
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'test-alert') {
    const { sendAdminAlert } = await import('@/lib/automation/alerts')
    const sent = await sendAdminAlert({ key: `test:${Date.now()}`, title: 'Test alert', detail: 'This is a test of CodeSpectra operations alerts. Nothing is wrong.', severity: 'warning', link: '/dashboard/admin/automations' })
    return NextResponse.json({ ok: sent })
  }
  if (body.action === 'unsuppress') {
    const { unsuppressAddress, normalizeEmail } = await import('@/lib/automation/outbox')
    const email = normalizeEmail(body.email)
    if (!email) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    await unsuppressAddress(email)
    await auditAdmin(gate.user, 'email.unsuppress', 'email', 'suppression', 'address re-enabled', 'warning')
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}

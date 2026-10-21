/**
 * Admin → Company patterns → settings: weekly refresh switch, rotation share
 * and the AI caps. POST { action: 'refresh' } runs the weekly refresh now
 * (same job, same caps; ignores the on/off switch). Superadmin only.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { aiUsageState, getCompanyTestSettings, saveCompanyTestSettings } from '@/lib/company-tests/db'
import { settingsSchema } from '@/lib/company-tests/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const [settings, usage] = await Promise.all([getCompanyTestSettings(true), aiUsageState()])
  return NextResponse.json({ settings, usage })
}

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const parsed = settingsSchema.strict().safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return NextResponse.json({ error: i ? `${i.path.join('.') || 'settings'}: ${i.message}` : 'Invalid settings' }, { status: 400 })
  }
  try {
    const settings = await saveCompanyTestSettings(parsed.data, gate.user.id)
    return NextResponse.json({ settings })
  } catch (e) {
    console.error('[admin/company-patterns] settings:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not save settings. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'company-tests-refresh', gate.user.id, 2, 10 * 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => ({}))) as { action?: unknown }
  if (body.action !== 'refresh') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const { runLeasedJob, minuteWindow } = await import('@/lib/automation/job-lease')
  const { runCompanyTestsRefresh } = await import('@/lib/company-tests/refresh')
  const r = await runLeasedJob('company-tests-refresh', `manual:${minuteWindow(new Date())}`, () => runCompanyTestsRefresh(), { leaseMs: 30 * 60_000, maxAttempts: 1 })
  if (!r.ran) return NextResponse.json({ error: 'A refresh is already running. Try again in a minute.' }, { status: 409 })
  if (!r.ok) return NextResponse.json({ error: 'The refresh failed. Check Cron jobs for details.' }, { status: 500 })
  return NextResponse.json({ report: r.result })
}

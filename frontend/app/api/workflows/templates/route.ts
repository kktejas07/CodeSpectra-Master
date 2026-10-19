/**
 * GET /api/workflows/templates — the templates gallery (platform-only ones
 * are hidden from organisation admins). Install with
 * POST /api/workflows { template_id }.
 */
import { NextResponse } from 'next/server'
import { requireWorkflowAdmin } from '@/lib/automation/access'
import { templateAvailableTo, WORKFLOW_TEMPLATES } from '@/lib/automation/templates'

export const runtime = 'nodejs'

export async function GET() {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { systemAutomationById } = await import('@/lib/automation/system/registry')
  const items = WORKFLOW_TEMPLATES.filter((t) => templateAvailableTo(t, g.platform)).map((t) => ({
    id: t.id, name: t.name, description: t.description, category: t.category, trigger: t.trigger,
    event_type: t.event_type ?? null, cron_expression: t.cron_expression ?? null, setup: t.setup ?? null,
    step_count: t.steps.length, platform_only: !templateAvailableTo(t, false),
    replaces: t.replaces ? { id: t.replaces, title: systemAutomationById(t.replaces)?.title || t.replaces } : null,
  }))
  return NextResponse.json({ items })
}

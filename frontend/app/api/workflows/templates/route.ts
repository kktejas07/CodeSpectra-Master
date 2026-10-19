/**
 * GET /api/workflows/templates — the templates gallery (platform-only ones
 * are hidden from organisation admins). Install with
 * POST /api/workflows { template_id }.
 */
import { NextResponse } from 'next/server'
import { requireWorkflowAdmin } from '@/lib/automation/access'
import { WORKFLOW_TEMPLATES } from '@/lib/automation/templates'

export const runtime = 'nodejs'

export async function GET() {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const items = WORKFLOW_TEMPLATES.filter((t) => g.platform || !t.platformOnly).map((t) => ({
    id: t.id, name: t.name, description: t.description, category: t.category, trigger: t.trigger,
    event_type: t.event_type ?? null, cron_expression: t.cron_expression ?? null, setup: t.setup ?? null,
    step_count: t.steps.length, platform_only: !!t.platformOnly,
  }))
  return NextResponse.json({ items })
}

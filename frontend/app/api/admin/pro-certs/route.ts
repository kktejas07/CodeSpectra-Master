/**
 * Admin → Certifications (superadmin).
 * GET  — every certification (drafts too) + the starter templates.
 * POST { template: slug } — add a starter blueprint as a draft, or
 * POST { program: ProgramInput } — create a draft from the editor.
 */
import { requireSuperAdmin } from '@/lib/route-auth'
import { errorJson, json } from '@/lib/pro-certs/http'
import { PROGRAM_TEMPLATES } from '@/lib/pro-certs/types'
import { auditAdmin } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await requireSuperAdmin()
  if ('error' in g) return json({ error: g.error }, g.status)
  try {
    const { listPrograms } = await import('@/lib/pro-certs/service')
    return json({ programs: await listPrograms(), templates: PROGRAM_TEMPLATES.map((t) => ({ slug: t.slug, title: t.title, summary: t.summary })) })
  } catch (e) {
    return errorJson(e, 'admin list')
  }
}

export async function POST(req: Request) {
  const g = await requireSuperAdmin()
  if ('error' in g) return json({ error: g.error }, g.status)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  try {
    const svc = await import('@/lib/pro-certs/service')
    if (body && typeof body.template === 'string') {
      const p = await svc.createFromTemplate(body.template, g.user.id)
      await auditAdmin(g.user, 'pro_cert.create', 'pro_cert_program', p.id, `template ${p.slug}`)
      return json({ program: p }, 201)
    }
    const parsed = svc.parseProgramInput(body?.program)
    if (!parsed.ok) return json({ error: parsed.error, code: 'pro_cert_invalid' }, 400)
    const p = await svc.createProgram(parsed.value, g.user.id)
    await auditAdmin(g.user, 'pro_cert.create', 'pro_cert_program', p.id, p.slug)
    return json({ program: p }, 201)
  } catch (e) {
    return errorJson(e, 'admin create')
  }
}

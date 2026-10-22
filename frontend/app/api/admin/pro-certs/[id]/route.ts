/**
 * Admin → one certification (superadmin).
 * GET   — the program + question-bank coverage per section (approved questions available vs one paper).
 * PUT   { program } — save the editor (full validation).
 * PATCH { status: 'draft' | 'published' | 'retired' } — publish (checks price, blueprint and bank coverage) or retire.
 */
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { errorJson, json } from '@/lib/pro-certs/http'
import { auditAdmin } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }
const idOk = (id: string) => /^[A-Za-z0-9-]{8,64}$/.test(id)

export async function GET(_req: Request, ctx: Ctx) {
  const g = await requireSuperAdmin()
  if ('error' in g) return json({ error: g.error }, g.status)
  const { id } = await ctx.params
  if (!idOk(id)) return json({ error: 'Certification not found.', code: 'pro_cert_not_found' }, 404)
  try {
    const { coverage, getProgram } = await import('@/lib/pro-certs/service')
    const p = await getProgram(id)
    if (!p) return json({ error: 'Certification not found.', code: 'pro_cert_not_found' }, 404)
    return json({ program: p, coverage: await coverage(p) })
  } catch (e) {
    return errorJson(e, 'admin get')
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const g = await requireSuperAdmin()
  if ('error' in g) return json({ error: g.error }, g.status)
  const { id } = await ctx.params
  if (!idOk(id)) return json({ error: 'Certification not found.', code: 'pro_cert_not_found' }, 404)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  try {
    const svc = await import('@/lib/pro-certs/service')
    const parsed = svc.parseProgramInput(body?.program)
    if (!parsed.ok) return json({ error: parsed.error, code: 'pro_cert_invalid' }, 400)
    const p = await svc.updateProgram(id, parsed.value)
    await auditAdmin(g.user, 'pro_cert.update', 'pro_cert_program', id, `v${p.version}`)
    if (p.status === 'published') {
      const { revalidateProCerts } = await import('@/lib/pro-certs/public-cache')
      await revalidateProCerts(p.slug)
    }
    return json({ program: p, coverage: await svc.coverage(p) })
  } catch (e) {
    return errorJson(e, 'admin update')
  }
}

const StatusBody = z.object({ status: z.enum(['draft', 'published', 'retired']) }).strict()

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await requireSuperAdmin()
  if ('error' in g) return json({ error: g.error }, g.status)
  const { id } = await ctx.params
  if (!idOk(id)) return json({ error: 'Certification not found.', code: 'pro_cert_not_found' }, 404)
  const b = StatusBody.safeParse(await req.json().catch(() => null))
  if (!b.success) return json({ error: 'Choose draft, published or retired.', code: 'pro_cert_status_invalid' }, 400)
  try {
    const { setProgramStatus } = await import('@/lib/pro-certs/service')
    const p = await setProgramStatus(id, b.data.status)
    await auditAdmin(g.user, `pro_cert.${b.data.status}`, 'pro_cert_program', id, p.slug, b.data.status === 'published' ? 'warning' : 'info')
    const { revalidateProCerts } = await import('@/lib/pro-certs/public-cache')
    await revalidateProCerts(p.slug)
    return json({ program: p })
  } catch (e) {
    return errorJson(e, 'admin status')
  }
}

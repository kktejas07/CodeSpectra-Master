/**
 * GET /api/live-drives/[id]/integrity   the drive's integrity settings (organisers)
 * PUT /api/live-drives/[id]/integrity   change them (same validator as tests / contests)
 */
import { badId, body, handle, ID_RE, json } from '@/lib/live-drives/http'
import { LiveDriveError, loadForStaff } from '@/lib/live-drives/service'
import { getSettings, loadTarget, saveSettings } from '@/lib/integrity/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('integrity GET', async (user) => {
    await loadForStaff(user, id)
    return json({ settings: await getSettings('drive', id) })
  })
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('integrity PUT', async (user) => {
    const { role } = await loadForStaff(user, id)
    if (role !== 'owner') throw new LiveDriveError('Only the drive organisers can do this.', 403, 'ld_owner_only')
    const t = await loadTarget('drive', id)
    if (!t) throw new LiveDriveError('Live drive not found', 404, 'ld_not_found')
    const raw = (await body(req)) as Record<string, unknown> | null
    // Similarity / AI-written reports need an answer export drives don't have: keep them off.
    const r = await saveSettings({ id: user.id, role: user.role, tenantId: user.tenantId ?? null }, t, { ...(raw ?? {}), similarity: { enabled: false }, ai_signals: { enabled: false } })
    if (!r.ok) throw new LiveDriveError(r.error, r.status)
    return json({ settings: r.data })
  })
}

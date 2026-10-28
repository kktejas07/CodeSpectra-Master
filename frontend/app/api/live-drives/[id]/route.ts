/**
 * GET   /api/live-drives/[id]   the drive (organisers and invigilators)
 * PATCH /api/live-drives/[id]   { title?, schedule?, rules?, status? } (organisers; scheduling builds the paper)
 */
import { badId, body, handle, ID_RE, json } from '@/lib/live-drives/http'
import { loadForStaff, staffDriveView, updateDrive } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('get', async (user) => {
    const { drive, role } = await loadForStaff(user, id)
    return json({ drive: staffDriveView(drive, role) })
  })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('patch', async (user) => json({ drive: staffDriveView(await updateDrive(user, id, await body(req)), 'owner') }))
}

/**
 * GET  /api/live-drives    drives you organise or invigilate + organisations you may run drives for
 * POST /api/live-drives    create a drive (draft) — college placement team or company hiring admin/recruiter
 */
import { limitRequest } from '@/lib/rate-limit'
import { body, handle, json } from '@/lib/live-drives/http'
import { createDrive, listDrivesForStaff } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return handle('list', async (user) => json(await listDrivesForStaff(user)))
}

export async function POST(req: Request) {
  return handle('create', async (user) => {
    const limited = await limitRequest(req, 'live-drive-create', user.id, 20, 60 * 60_000)
    if (limited) return limited
    return json({ drive: await createDrive(user, await body(req)) }, 201)
  })
}

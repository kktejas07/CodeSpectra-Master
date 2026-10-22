/** PUT /api/live-drives/[id]/invigilators  { emails, group_size? } — set invigilators and share the groups among them. */
import { badId, body, handle, ID_RE, json } from '@/lib/live-drives/http'
import { setInvigilators } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params
  if (!ID_RE.test(id)) return badId()
  return handle('invigilators', async (user) => json(await setInvigilators(user, id, await body(req))))
}

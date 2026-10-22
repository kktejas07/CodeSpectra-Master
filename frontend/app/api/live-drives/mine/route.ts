/** GET /api/live-drives/mine — drives you are a candidate in. */
import { handle, json } from '@/lib/live-drives/http'
import { myDrives } from '@/lib/live-drives/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return handle('mine', async (user) => json({ drives: await myDrives(user) }))
}

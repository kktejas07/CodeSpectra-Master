/** PATCH /api/campus/applications/[id] { status } — placement team moves an application. */
import { NextResponse } from 'next/server'
import { guarded, readJson, withStaff } from '@/lib/campus/access'
import { setApplicationStatus } from '@/lib/campus/drives'

export const runtime = 'nodejs'
type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  return guarded('application PATCH', () => withStaff(req, async (ctx) => {
    const body = await readJson(req)
    return NextResponse.json({ application: await setApplicationStatus(ctx, id, body.status) })
  }))
}

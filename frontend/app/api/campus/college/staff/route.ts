/**
 * POST   /api/campus/college/staff { email }   add a placement officer (college admin only)
 * DELETE /api/campus/college/staff?user=<id>   remove one
 */
import { NextResponse } from 'next/server'
import { bad, guarded, readJson, withStaff } from '@/lib/campus/access'
import { addStaff, removeStaff } from '@/lib/campus/service'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  return guarded('staff POST', () => withStaff(req, async (ctx) => {
    const body = await readJson(req)
    return NextResponse.json({ staff: await addStaff(ctx, body.email) })
  }, { adminOnly: true }))
}

export async function DELETE(req: Request) {
  return guarded('staff DELETE', () => withStaff(req, async (ctx) => {
    const id = new URL(req.url).searchParams.get('user') || ''
    if (!id || id.length > 80) return bad('Pick the officer to remove')
    return NextResponse.json({ staff: await removeStaff(ctx, id) })
  }, { adminOnly: true }))
}

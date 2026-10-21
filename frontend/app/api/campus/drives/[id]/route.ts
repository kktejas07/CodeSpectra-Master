/**
 * GET   /api/campus/drives/[id]   drive + applicants (placement team)
 * PATCH /api/campus/drives/[id]   { drive?: full input, status?: draft|open|closed|completed }
 */
import { NextResponse } from 'next/server'
import { guarded, readJson, withStaff } from '@/lib/campus/access'
import { driveApplicants, getDrive, updateDrive } from '@/lib/campus/drives'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  return guarded('drive GET', () => withStaff(req, async (ctx) => {
    const drive = await getDrive(ctx, id)
    return NextResponse.json({ drive, applicants: await driveApplicants(ctx, drive) })
  }))
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  return guarded('drive PATCH', () => withStaff(req, async (ctx) => NextResponse.json({ drive: await updateDrive(ctx, id, await readJson(req)) })))
}

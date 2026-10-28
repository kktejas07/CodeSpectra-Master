/**
 * GET    /api/campus/students/[id]   record + drive history (placement team)
 * PATCH  /api/campus/students/[id]   officer fields / verify
 * POST   /api/campus/students/[id]   resend the invite email
 * DELETE /api/campus/students/[id]   remove a record with no applications
 */
import { NextResponse } from 'next/server'
import { guarded, readJson, withStaff } from '@/lib/campus/access'
import { patchStudent, removeStudent, resendInvite } from '@/lib/campus/service'
import { studentDetail } from '@/lib/campus/drives'

export const runtime = 'nodejs'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  return guarded('student GET', () => withStaff(req, async (ctx) => NextResponse.json(await studentDetail(ctx, id))))
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  return guarded('student PATCH', () => withStaff(req, async (ctx) => NextResponse.json({ student: await patchStudent(ctx, id, await readJson(req)) })))
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  return guarded('student invite', () => withStaff(req, async (ctx) => NextResponse.json(await resendInvite(ctx, id))))
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params
  return guarded('student DELETE', () => withStaff(req, async (ctx) => {
    await removeStudent(ctx, id)
    return NextResponse.json({ ok: true })
  }))
}

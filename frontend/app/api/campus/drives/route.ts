/**
 * GET  /api/campus/drives?status   the college's drives with applicant counts (placement team)
 * POST /api/campus/drives          create a drive (draft)
 */
import { NextResponse } from 'next/server'
import { guarded, readJson, withStaff } from '@/lib/campus/access'
import { createDrive, listDrives } from '@/lib/campus/drives'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return guarded('drives GET', () => withStaff(req, async (ctx) => NextResponse.json({ items: await listDrives(ctx, new URL(req.url).searchParams.get('status')) })))
}

export async function POST(req: Request) {
  return guarded('drives POST', () => withStaff(req, async (ctx) => NextResponse.json({ drive: await createDrive(ctx, await readJson(req)) }, { status: 201 })))
}

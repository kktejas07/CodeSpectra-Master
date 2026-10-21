/** PATCH /api/campus/offers/[id] { status?, joining_date?, ctc_minor? } — placement team. */
import { NextResponse } from 'next/server'
import { guarded, readJson, withStaff } from '@/lib/campus/access'
import { updateOffer } from '@/lib/campus/drives'

export const runtime = 'nodejs'
type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  return guarded('offer PATCH', () => withStaff(req, async (ctx) => NextResponse.json({ offer: await updateOffer(ctx, id, await readJson(req)) })))
}

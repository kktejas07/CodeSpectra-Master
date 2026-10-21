/**
 * GET  /api/campus/offers?year   offers (placement team only — students see theirs on /api/campus/me)
 * POST /api/campus/offers        record an offer (CTC in integer minor units)
 */
import { NextResponse } from 'next/server'
import { guarded, readJson, withStaff } from '@/lib/campus/access'
import { createOffer, listOffers } from '@/lib/campus/drives'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return guarded('offers GET', () => withStaff(req, async (ctx) => {
    const y = Number(new URL(req.url).searchParams.get('year'))
    return NextResponse.json({ items: await listOffers(ctx, Number.isInteger(y) && y > 2000 ? y : null) }, { headers: { 'Cache-Control': 'no-store' } })
  }))
}

export async function POST(req: Request) {
  return guarded('offers POST', () => withStaff(req, async (ctx) => NextResponse.json({ offer: await createOffer(ctx, await readJson(req)) }, { status: 201 })))
}

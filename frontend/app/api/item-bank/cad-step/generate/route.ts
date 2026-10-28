/**
 * Frontend proxy: browser → POST /api/item-bank/cad-step/generate
 * → backend /api/item-bank/cad-step/generate (generates + stages a draft item).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const prompt = String(body.prompt ?? '').trim().slice(0, 4000)
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  try {
    const data = await backendPost<Record<string, unknown>>(
      '/api/item-bank/cad-step/generate',
      {
        title: String(body.title ?? 'CAD Part Modeling Challenge').slice(0, 200),
        prompt,
        region_standard: String(body.region_standard ?? 'ISO'),
        unit_system: String(body.unit_system ?? 'metric'),
        viva_required: body.viva_required !== false,
        points: Number(body.points ?? 100),
      },
    )
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[item-bank/cad-step/generate]', msg)
    return NextResponse.json({ error: 'Saving to the item bank failed. Try again in a moment.' }, { status: 502 })
  }
}

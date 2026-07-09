import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { resolveModel } from '@/lib/ai/get-user-model'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { providerOverride, modelOverride, modelRole, endpointOverride } = await resolveModel(gate.user.id, 'hints_model')
  // ponytail: model prefs resolved for future AI-powered skills analysis; no backend AI call yet

  try {
    const db = await getMongoDb()
    const data = await db.collection('skill_analytics').find({ user_id: gate.user.id }).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

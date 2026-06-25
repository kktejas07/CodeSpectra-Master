import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { pricingFeatures, newId, nowIso } from '@/lib/db/misc'

const FALLBACK_FEATURES = [
  { id: '1', name: 'Unlimited Challenges', description: 'Access all challenges' },
  { id: '2', name: 'AI Code Review', description: 'Get AI-powered feedback' },
  { id: '3', name: 'Team Collaboration', description: 'Invite team members' },
  { id: '4', name: 'Advanced Analytics', description: 'Detailed progress tracking' },
  { id: '5', name: 'Code Scanner', description: 'Automated code analysis' },
  { id: '6', name: 'API Access', description: 'REST API integration' },
]

export async function GET(_req: NextRequest) {
  try {
    const col = await pricingFeatures()
    const data = await col.find({}).toArray()
    return NextResponse.json({ data: data.length ? data : FALLBACK_FEATURES })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching features:', error)
    return NextResponse.json({ data: FALLBACK_FEATURES }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = (await req.json()) as Record<string, unknown>
    const doc = { ...body, id: newId(), created_at: nowIso() }
    const col = await pricingFeatures()
    await col.insertOne(doc as unknown as Parameters<typeof col.insertOne>[0])
    return NextResponse.json({ data: doc }, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] Error creating feature:', error)
    return NextResponse.json({ error: 'Failed to create feature' }, { status: 400 })
  }
}

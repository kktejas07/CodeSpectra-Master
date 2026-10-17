import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getDefaultPlans } from '@/lib/plans-client'
import { invalidatePlanCache } from '@/lib/plans'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/plans — list all plans (auto-seeds if empty)
 */
export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const col = db.collection('plans')
    let plans = await col.find({}).toArray()

    // Auto-seed default plans
    if (plans.length === 0) {
      const defaults = getDefaultPlans()
      const docs = defaults.map(p => ({
        ...p,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
      await col.insertMany(docs as any)
      invalidatePlanCache()
      plans = await col.find({}).toArray()
    }

    return NextResponse.json({ plans })
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/plans:', e)
    return NextResponse.json({ error: 'Something went wrong with plans. Try again.' }, { status: 500 })
  }
}

/**
 * POST /api/admin/plans — create or update a plan
 */
export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.plan || !body.name) {
    return NextResponse.json({ error: 'plan and name are required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const col = db.collection('plans')

    const { _id: _mongoId, ...rest } = body
    const doc = {
      ...rest,
      updatedAt: new Date().toISOString(),
    }

    const existing = await col.findOne({ plan: body.plan })
    if (existing) {
      await col.updateOne({ plan: body.plan }, { $set: doc })
    } else {
      await col.insertOne({ ...doc, createdAt: new Date().toISOString() })
    }

    invalidatePlanCache()
    return NextResponse.json({ plan: doc })
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/plans:', e)
    return NextResponse.json({ error: 'Something went wrong with plans. Try again.' }, { status: 500 })
  }
}

import { NextResponse, NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { normalizeChallengeRow } from '@/lib/challenges/normalize'
import { AUTHORED_CHALLENGES } from '@/lib/challenges/seeds'

interface ChallengeDoc {
  id: string
  title: string
  type: string
  difficulty: string
  duration_minutes: number
  success_rate: number
  description: string
  starter_code?: string | null
  tenant_id?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

const SEED_CHALLENGES = AUTHORED_CHALLENGES


async function ensureSeeded() {
  try {
    const db = await getMongoDb()
    const col = db.collection('challenges')
    const n = await col.estimatedDocumentCount()
    if (n > 0) return
    const now = new Date().toISOString()
    const docs = SEED_CHALLENGES.map((c) => ({
      ...c,
      created_at: now,
      updated_at: now,
    }))
    await col.insertMany(docs)
  } catch {
    console.warn('[CodeSpectra] challenges auto-seed skipped')
  }
}

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    await ensureSeeded()
    const db = await getMongoDb()
    // role-scope: narrows a tenant admin to their own org (never a grant)
    const baseFilter: Record<string, unknown> = gate.user.role === 'tenant_admin'
      ? (gate.user.tenantId ? { tenant_id: gate.user.tenantId } : { _id: null })
      : {}
    // Generated challenges are drafts until a human approves them
    // (/dashboard/admin/practice-review). Legacy rows have no review_status and
    // stay visible.
    const filter = { ...baseFilter, review_status: { $nin: ['draft', 'rejected'] } }
    const data = (await db.collection('challenges').find(filter).toArray()).map(d =>
      normalizeChallengeRow(d as Record<string, unknown>),
    )
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = (await request.json()) as Partial<ChallengeDoc>
    if (!body.title || !body.type) {
      return NextResponse.json({ error: 'title and type are required' }, { status: 400 })
    }
    const now = new Date().toISOString()
    const doc: ChallengeDoc = {
      id: body.id || `ch_${Date.now()}`,
      title: body.title,
      type: body.type,
      difficulty: body.difficulty || 'medium',
      duration_minutes: body.duration_minutes || 15,
      success_rate: body.success_rate ?? 50,
      description: body.description || '',
      starter_code: body.starter_code ?? null,
      tenant_id: gate.user.tenantId || null,
      created_by: gate.user.id,
      created_at: now,
      updated_at: now,
    }
    const db = await getMongoDb()
    await db.collection('challenges').insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('[challenges]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

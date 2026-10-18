import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { MODEL_OPTIONS, UserAISettings } from '@/lib/ai/model-options'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cheap defaults for everyone; a user can opt into a premium model.
const defaults: UserAISettings = {
  chat_model: 'gemini-flash',
  review_model: 'gemini-flash',
  hints_model: 'gemini-flash',
  grade_model: 'gemini-flash',
}

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getMongoDb()
  const doc = await db.collection('user_ai_settings').findOne({ user_id: user.id })
  const settings = doc?.settings || defaults
  return NextResponse.json({ settings, models: MODEL_OPTIONS })
}

export async function PUT(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Partial<UserAISettings>
  const db = await getMongoDb()

  // Validate model IDs
  const validIds = new Set(MODEL_OPTIONS.map((m) => m.id))
  for (const [key, val] of Object.entries(body)) {
    if (val && !validIds.has(val as string)) {
      return NextResponse.json({ error: `Invalid model: ${val}` }, { status: 400 })
    }
  }

  await db.collection('user_ai_settings').updateOne(
    { user_id: user.id },
    { $set: { settings: { ...defaults, ...body }, updated_at: new Date().toISOString() } },
    { upsert: true },
  )

  return NextResponse.json({ ok: true, settings: { ...defaults, ...body } })
}

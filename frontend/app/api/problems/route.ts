import { NextResponse, NextRequest } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/route-auth'
import { problems, nowIso, type ProblemDoc } from '@/lib/db/problems'
import { SEED_PROBLEMS } from '@/lib/db/seed-problems'
import { sanitizeRegex } from '@/lib/sanitize'

/** Insert default problems if the collection is empty. Best-effort. */
async function ensureSeeded() {
  try {
    const col = await problems()
    const n = await col.estimatedDocumentCount()
    if (n > 0) return
    const now = nowIso()
    const docs: ProblemDoc[] = SEED_PROBLEMS.map((p) => ({
      ...p,
      created_at: now,
      updated_at: now,
    }))
    await col.insertMany(docs)
  } catch (e) {
    console.warn('[CodeSpectra] problem auto-seed skipped:', e)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const difficulty = searchParams.get('difficulty') as ProblemDoc['difficulty'] | null
  const search = searchParams.get('q')?.trim()
  const topicsParam = searchParams.get('topics')?.trim()
  const includeHidden = searchParams.get('include_hidden') === 'true'
  const forHackathon = searchParams.get('for_hackathon') === 'true'

  const isAdmin = await (async () => {
    const gate = await requireAdmin()
    return !('error' in gate)
  })()

  try {
    await ensureSeeded()
    const filter: Record<string, unknown> = { is_published: true }

    if (!isAdmin) {
      filter.$or = [
        { visibility: { $exists: false } },
        { visibility: 'public' },
        { hackathon_id: null },
      ]
    }

    if (difficulty) filter.difficulty = difficulty
    if (search) filter.title = { $regex: sanitizeRegex(search), $options: 'i' }
    if (topicsParam) {
      const topics = topicsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      if (topics.length > 0) filter.topics = { $in: topics }
    }

    const col = await problems()
    const list = await col
      .find(filter, { projection: { test_cases: 0, starter_code: 0, statement_md: 0 } })
      .sort({ created_at: 1 })
      .toArray()
    if (list.length > 0) {
      return NextResponse.json({ data: list, count: list.length })
    }
  } catch (error) {
    console.warn('[CodeSpectra] problems GET (mongo unavailable, using seed):', error)
  }

  // Fallback to in-memory seed (only public problems)
  const seedList = SEED_PROBLEMS.filter((p) => {
    if (!p.is_published) return false
    if (difficulty && p.difficulty !== difficulty) return false
    if (search && !(p.title || '').toLowerCase().includes(search.toLowerCase())) return false
    if (topicsParam) {
      const topics = topicsParam.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      if (topics.length > 0 && !topics.some(t => (p.topics || []).map(pt => pt.toLowerCase()).includes(t))) return false
    }
    return true
  }).map(({ test_cases: _t, starter_code: _s, statement_md: _m, ...rest }) => ({
    ...rest,
    _source: 'seed' as const,
  }))

  return NextResponse.json({ data: seedList, count: seedList.length })
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = (await request.json()) as Partial<ProblemDoc>
    if (!body.title || !body.slug) {
      return NextResponse.json({ error: 'title and slug are required' }, { status: 400 })
    }
    const now = nowIso()
    const doc: ProblemDoc = {
      id: body.id || `p_${body.slug.replace(/\s+/g, '_').toLowerCase()}`,
      slug: body.slug,
      title: body.title,
      difficulty: body.difficulty || 'easy',
      topics: body.topics || [],
      statement_md: body.statement_md || '',
      input_format: body.input_format ?? null,
      output_format: body.output_format ?? null,
      constraints: body.constraints ?? null,
      example_explanation: body.example_explanation ?? null,
      test_cases: body.test_cases || [],
      starter_code: body.starter_code || {},
      time_limit_ms: body.time_limit_ms || 2000,
      memory_limit_kb: body.memory_limit_kb || 65536,
      is_published: body.is_published !== false,
      visibility: body.visibility || 'public',
      hackathon_id: body.hackathon_id || null,
      created_by: gate.user.id,
      created_at: now,
      updated_at: now,
    }
    const col = await problems()
    await col.insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 })
  }
}

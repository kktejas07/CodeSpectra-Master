import { NextResponse, NextRequest } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/route-auth'
import { problems, nowIso, newId, type ProblemDoc } from '@/lib/db/problems'
import { SEED_PROBLEMS } from '@/lib/db/seed-problems'
import { SEED_PROBLEMS_BULK } from '@/scripts/seed-problems-bulk'
import { sanitizeRegex } from '@/lib/sanitize'

async function ensureSeeded() {
  try {
    const col = await problems()
    const n = await col.estimatedDocumentCount()
    if (n > 0) return
    const now = nowIso()
    const all = [...SEED_PROBLEMS, ...SEED_PROBLEMS_BULK]
    const seen = new Set<string>()
    const uniqueAll = all.filter((p) => {
      const k = p.id || p.slug
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
    const docs: ProblemDoc[] = uniqueAll.map((p) => ({
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
  // Accept both `q` (canonical) and `search` (alias used by hackathon pickers)
  const search = searchParams.get('q')?.trim() || searchParams.get('search')?.trim()
  const topicsParam = searchParams.get('topics')?.trim()
  const includeHidden = searchParams.get('include_hidden') === 'true'
  const forHackathon = searchParams.get('for_hackathon') === 'true'
  const rawLimit = searchParams.get('limit')
  const limitParam = rawLimit === null
    ? 0
    : Math.min(50, Math.max(1, Number(rawLimit) || 0))

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
      .sort({ created_at: -1 })
      .limit(limitParam || 0)
      .toArray()
    if (list.length > 0) {
      const seen = new Set<string>()
      const uniqueList = list.filter((p) => {
        const k = (p as any).id || (p as any).slug
        if (!k || seen.has(k)) return false
        seen.add(k)
        return true
      })
      return NextResponse.json({ data: uniqueList, count: uniqueList.length })
    }
  } catch (error) {
    console.warn('[CodeSpectra] problems GET (mongo unavailable, using seed):', error)
  }

  // Fallback to in-memory seed (only public problems)
  const list = SEED_PROBLEMS.filter((p) => {
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
  const seedList = limitParam > 0 ? list.slice(0, limitParam) : list

  return NextResponse.json({ data: seedList, count: seedList.length })
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = (await request.json()) as Partial<ProblemDoc>
    if (!body.title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    const col = await problems()
    // Dedupe slug against the unique index (append -n) so common titles like
    // "Two Sum" don't 500 with an E11000 duplicate-key error.
    const baseSlug = (body.slug || body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
      .replace(/\s+/g, '_').toLowerCase()
    let slug = baseSlug || `p_${Date.now()}`
    let n = 0
    while (await col.findOne({ slug })) {
      n += 1
      slug = `${baseSlug}-${n}`
    }
    const now = nowIso()
    const doc: ProblemDoc = {
      id: newId(),
      slug,
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
    await col.insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('[problems]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

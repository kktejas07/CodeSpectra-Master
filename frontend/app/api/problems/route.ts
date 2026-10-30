import { NextResponse, NextRequest } from 'next/server'
import { requireAdmin, getAPIUser, gateErrorBody } from '@/lib/route-auth'
import { accessFor, getPackContext } from '@/lib/entitlements'
import { problems, nowIso, newId, type ProblemDoc } from '@/lib/db/problems'
import { SEED_PROBLEMS } from '@/lib/db/seed-problems'
import { SEED_PROBLEMS_BULK } from '@/scripts/seed-problems-bulk'
import { sanitizeRegex } from '@/lib/sanitize'
import { knowledgeOnLibraryChange } from '@/lib/rag/hooks'
import { normalizeTitle } from '@/lib/practice-content/uniqueness'

/**
 * Make sure every authored seed is present.
 *
 * This used to bail out as soon as the collection had ANY row, so a database
 * with 22 problems never received the other 55 hand-written ones — the page
 * showed 6 solvable problems while 55 sat unused in the repo (2026-10-30).
 * Now it upserts what is missing, which costs one query when nothing is.
 */
async function ensureSeeded() {
  try {
    const col = await problems()
    const all = [...SEED_PROBLEMS, ...SEED_PROBLEMS_BULK]
    const seen = new Set<string>()
    const uniqueAll = all.filter((p) => {
      const k = p.id || p.slug
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })

    const rows = await col.find({}, { projection: { id: 1, slug: 1, title: 1 } }).toArray()
    const present = new Set(rows.flatMap((d) => [String(d.id ?? ''), String(d.slug ?? '')]).filter(Boolean))
    // Titles collide across seeds too ("Maximum Subarray" exists in both lists);
    // adding them by id alone would resurrect a duplicate on the page.
    const titles = new Set(rows.map((d) => normalizeTitle(d.title)).filter(Boolean))
    const missing = uniqueAll.filter((p) => {
      if (present.has(String(p.id ?? '')) || present.has(String(p.slug ?? ''))) return false
      const key = normalizeTitle(p.title)
      if (titles.has(key)) return false
      titles.add(key)
      return true
    })
    if (missing.length === 0) return

    const now = nowIso()
    const docs: ProblemDoc[] = missing.map((p) => ({
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

  const adminGate = await requireAdmin()
  const isAdmin = !('error' in adminGate)
  // Company admins see platform problems and their own company's, never other companies'.
  const tenantScope =
    isAdmin && 'user' in adminGate && adminGate.user.role === 'tenant_admin'
      ? { $or: [{ tenant_id: { $exists: false } }, { tenant_id: null }, { tenant_id: adminGate.user.tenantId ?? '__none__' }] }
      : null

  try {
    await ensureSeeded()
    const filter: Record<string, unknown> = { is_published: true }

    if (!isAdmin) {
      // hackathon_only problems never list publicly (GET [slug] gates them per event).
      filter.$or = [
        { visibility: { $exists: false } },
        { visibility: 'public' },
      ]
    }

    if (tenantScope) filter.$and = [tenantScope]
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
      // Pack locks for this viewer (the problem page and run / submit enforce them server-side).
      const viewer = await getAPIUser().catch(() => null)
      const ctx = await getPackContext(viewer).catch((e) => {
        console.error('[problems] pack context failed:', e)
        return null
      })
      const data = ctx
        ? uniqueList.map((p) => {
            const a = accessFor(ctx, { id: p.id, slug: p.slug, topics: p.topics })
            return a.packIds.length ? { ...p, locked: a.locked, unlock_pack: a.locked ? a.unlockWith : null } : p
          })
        : uniqueList
      return NextResponse.json({ data, count: data.length })
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

/**
 * POST /api/problems — admins only (SEC-037). The practice library and the
 * platform knowledge index are curated: a learner account can't add to them
 * (there is no learner authoring UI). requireAdmin also enforces admin 2FA.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json(gateErrorBody(gate), { status: gate.status })
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
      // Owner tenant: a tenant admin's problems stay editable by that tenant only.
      ...(gate.user.role === 'tenant_admin' && gate.user.tenantId ? { tenant_id: gate.user.tenantId } : {}),
      created_by: gate.user.id,
      created_at: now,
      updated_at: now,
    }
    await col.insertOne(doc)
    if (doc.is_published) knowledgeOnLibraryChange('problem', doc.id) // RAG-003: searchable within a minute
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('[problems]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

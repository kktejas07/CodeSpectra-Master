import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { problems, nowIso, type TestCase } from '@/lib/db/problems'
import { SEED_PROBLEMS } from '@/lib/db/seed-problems'

/**
 * GET /api/problems/[slug]
 * Returns the full problem doc INCLUDING starter code and sample test cases
 * but EXCLUDING hidden test cases (we only ship `is_sample: true` ones).
 *
 * If MongoDB is unavailable (no MONGODB_URI), falls back to the seed list
 * so the arena UI remains usable in demo mode.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params

  try {
    const col = await problems()
    const doc = await col.findOne({ $or: [{ slug }, { id: slug }] })
    if (doc) {
      return NextResponse.json({
        ...doc,
        test_cases: (doc.test_cases || []).filter((t) => t.is_sample),
        hidden_test_count:
          (doc.test_cases || []).length -
          (doc.test_cases || []).filter((t) => t.is_sample).length,
      })
    }
  } catch (error) {
    console.warn('[CodeSpectra] problem GET (mongo unavailable, using seed):', error)
  }

  // Fallback: in-memory seed (check both slug and id fields)
  const seed = SEED_PROBLEMS.find((p) => p.slug === slug || p.id === slug)
  if (!seed) {
    return NextResponse.json({ error: 'Problem not found' }, { status: 404 })
  }
  return NextResponse.json({
    ...seed,
    test_cases: seed.test_cases.filter((t) => t.is_sample),
    hidden_test_count: seed.test_cases.length - seed.test_cases.filter((t) => t.is_sample).length,
    _source: 'seed',
  })
}

/**
 * PATCH /api/problems/[slug]
 * Updates editable fields (statement, I/O format, constraints, test cases,
 * difficulty, topics, title). Caller must be the problem owner OR an admin.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { slug } = await ctx.params
  try {
    const col = await problems()
    const doc = await col.findOne({ $or: [{ slug }, { id: slug }] })
    if (!doc) return NextResponse.json({ error: 'Problem not found' }, { status: 404 })

    const isOwner = doc.created_by && doc.created_by === gate.user.id
    const isAdmin = gate.user.role === 'superadmin' || gate.user.role === 'tenant_admin'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden — only the owner or an admin can edit this problem' }, { status: 403 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const allowed = [
      'title', 'difficulty', 'topics', 'statement_md', 'input_format',
      'output_format', 'constraints', 'example_explanation', 'test_cases',
      'starter_code', 'time_limit_ms', 'memory_limit_kb', 'is_published',
    ]
    const patch: Record<string, unknown> = {}

    if ('title' in body) patch.title = String(body.title || '').trim()
    if ('difficulty' in body) {
      patch.difficulty = ['easy', 'medium', 'hard'].includes(String(body.difficulty))
        ? String(body.difficulty)
        : 'medium'
    }
    if ('topics' in body) patch.topics = Array.isArray(body.topics) ? body.topics.map(String) : []
    if ('statement_md' in body) patch.statement_md = String(body.statement_md ?? '')
    if ('input_format' in body) patch.input_format = body.input_format === null ? null : String(body.input_format ?? '')
    if ('output_format' in body) patch.output_format = body.output_format === null ? null : String(body.output_format ?? '')
    if ('constraints' in body) patch.constraints = body.constraints === null ? null : String(body.constraints ?? '')
    if ('example_explanation' in body) patch.example_explanation = body.example_explanation === null ? null : String(body.example_explanation ?? '')
    if ('starter_code' in body && body.starter_code && typeof body.starter_code === 'object') {
      patch.starter_code = body.starter_code as Record<string, string>
    }
    if ('time_limit_ms' in body) patch.time_limit_ms = Number(body.time_limit_ms) || 2000
    if ('memory_limit_kb' in body) patch.memory_limit_kb = Number(body.memory_limit_kb) || 65536
    if ('is_published' in body) patch.is_published = Boolean(body.is_published)
    if ('test_cases' in body) {
      patch.test_cases = (Array.isArray(body.test_cases) ? body.test_cases : ([] as unknown[])).map((tc, i) => {
        const t = tc as Record<string, unknown>
        return {
          id: String(t.id) || `tc_${Date.now()}_${i}`,
          stdin: String(t.stdin ?? ''),
          expected_stdout: String(t.expected_stdout ?? ''),
          is_sample: Boolean(t.is_sample),
        } as TestCase
      })
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
    }

    patch.updated_at = nowIso()
    await col.updateOne({ _id: doc._id }, { $set: patch })
    return NextResponse.json({ ...doc, ...patch })
  } catch (error) {
    console.error('[problems/[slug]]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

/**
 * DELETE /api/problems/[slug]
 * Superadmin only. Deletes the problem doc; related submissions are kept
 * (they render as "Deleted problem" on public profiles / recent activity).
 */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  if (gate.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden — superadmin only' }, { status: 403 })
  }
  const { slug } = await ctx.params
  try {
    const col = await problems()
    const doc = await col.findOne({ $or: [{ slug }, { id: slug }] })
    if (!doc) return NextResponse.json({ error: 'Problem not found' }, { status: 404 })
    await col.deleteOne({ _id: doc._id })
    return NextResponse.json({ success: true, deletedId: doc.slug ?? doc.id })
  } catch (error) {
    console.error('[problems/[slug]]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

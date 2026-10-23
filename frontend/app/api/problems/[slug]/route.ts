import { NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin, gateErrorBody, getAPIUser, isAdminCaller, isSuperAdminCaller, type APIUser } from '@/lib/route-auth'
import { problems, nowIso, type TestCase, type ProblemDoc } from '@/lib/db/problems'
import { SEED_PROBLEMS } from '@/lib/db/seed-problems'
import { hackathons, hackathonTeams } from '@/lib/db/qr-events'
import { isHackathonStaff, isHackathonJudge } from '@/lib/hackathons/access'
import { checkProblemAccess, packLockedError } from '@/lib/entitlements'
import { knowledgeOnLibraryChange } from '@/lib/rag/hooks'

/**
 * Who may edit a problem: superadmin; its creator; or a tenant_admin of the
 * problem's own tenant. Global problems (no tenant_id) are superadmin/owner
 * only — a tenant admin editing them would change grading for everyone.
 */
function canEditProblem(user: APIUser | null, doc: Pick<ProblemDoc, 'created_by'> & { tenant_id?: string | null }): boolean {
  if (!user) return false
  if (isSuperAdminCaller(user)) return true // SEC-029: admin 2FA owed → no admin edit rights
  if (doc.created_by && doc.created_by === user.id) return true
  return user.role === 'tenant_admin' && isAdminCaller(user) && !!doc.tenant_id && doc.tenant_id === user.tenantId
}

/**
 * hackathon_only problems are visible to editors, and to staff, judges and
 * team members of an event that uses them once it has started; after an
 * event ends they become readable by anyone (showcase).
 */
async function canSeeHackathonProblem(user: APIUser | null, doc: ProblemDoc & { tenant_id?: string | null }): Promise<boolean> {
  if (canEditProblem(user, doc)) return true
  const events = await (await hackathons())
    .find({ 'tasks.problem_slug': doc.slug, status: { $ne: 'draft' } }, { projection: { id: 1, tenant_id: 1, judges: 1, starts_at: 1, ends_at: 1, status: 1 } })
    .toArray()
  const now = Date.now()
  for (const hk of events) {
    if (new Date(hk.ends_at).getTime() < now) return true
    if (!user) continue
    if (isHackathonStaff(user, hk) || isHackathonJudge(user, hk)) return true
    if (new Date(hk.starts_at).getTime() <= now) {
      const team = await (await hackathonTeams()).findOne({ hackathon_id: hk.id, 'members.user_id': user.id }, { projection: { id: 1 } })
      if (team) return true
    }
  }
  return false
}

/**
 * GET /api/problems/[slug]
 * Returns the full problem doc INCLUDING starter code and sample test cases
 * but EXCLUDING hidden test cases (we only ship `is_sample: true` ones).
 *
 * If MongoDB is unavailable (no MONGODB_URI), falls back to the seed list
 * so the arena UI remains usable in demo mode.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params
  const wantsEdit = new URL(request.url).searchParams.get('edit') === '1'

  try {
    const col = await problems()
    const doc = await col.findOne({ $or: [{ slug }, { id: slug }] })
    if (doc) {
      const user = await getAPIUser().catch(() => null)
      // Editors loading the edit form get every test, so a save never drops the hidden ones.
      if (wantsEdit && canEditProblem(user, doc)) {
        const { _id, ...rest } = doc
        void _id
        return NextResponse.json({ ...rest, can_edit: true })
      }
      if (doc.visibility === 'hackathon_only' && !(await canSeeHackathonProblem(user, doc))) {
        return NextResponse.json({ error: 'Problem not found', code: 'problem_not_found' }, { status: 404 })
      }
      if (doc.is_published === false && doc.visibility !== 'hackathon_only' && !canEditProblem(user, doc)) {
        return NextResponse.json({ error: 'Problem not found', code: 'problem_not_found' }, { status: 404 })
      }
      // Problem packs: locked problems show title only (lib/entitlements-core problemAccess).
      // Hackathon problems are gated by their event instead.
      if (doc.visibility !== 'hackathon_only') {
        // Fail closed: the seed fallback below must never serve a problem we couldn't check.
        const access = await checkProblemAccess(user, doc, canEditProblem(user, doc)).catch((e) => {
          console.error('[problems/[slug]] pack access check failed:', e)
          return null
        })
        if (!access) return NextResponse.json({ error: 'Could not load this problem. Please try again.' }, { status: 503 })
        if (access.locked) {
          return NextResponse.json(
            { ...packLockedError(access), problem: { id: doc.id, slug: doc.slug, title: doc.title, difficulty: doc.difficulty, topics: doc.topics } },
            { status: 402 },
          )
        }
      }
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
    return NextResponse.json({ error: 'Problem not found', code: 'problem_not_found' }, { status: 404 })
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
    if (!doc) return NextResponse.json({ error: 'Problem not found', code: 'problem_not_found' }, { status: 404 })

    if (!canEditProblem(gate.user, doc)) {
      return NextResponse.json({ error: 'Forbidden — only the owner or a platform admin can edit this problem' }, { status: 403 })
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
    // SEC-037: only an admin publishes to the public library / knowledge index.
    // A learner who created a problem earlier keeps it as a private draft: any
    // edit by a non-admin takes it out of the library until an admin publishes it.
    if (!isAdminCaller(gate.user) && Object.keys(patch).length > 0) {
      patch.is_published = false
      patch.review_status = 'pending_review' // shows up under Admin → Problems review
    }
    if ('test_cases' in body) {
      patch.test_cases = (Array.isArray(body.test_cases) ? body.test_cases : ([] as unknown[])).map((tc, i) => {
        const t = tc as Record<string, unknown>
        return {
          id: t.id ? String(t.id) : `tc_${Date.now()}_${i}`,
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
    knowledgeOnLibraryChange('problem', doc.id)
    return NextResponse.json({ ...doc, ...patch })
  } catch (error) {
    console.error('[problems/[slug]]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
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
  const gate = await requireSuperAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })
  const { slug } = await ctx.params
  try {
    const col = await problems()
    const doc = await col.findOne({ $or: [{ slug }, { id: slug }] })
    if (!doc) return NextResponse.json({ error: 'Problem not found', code: 'problem_not_found' }, { status: 404 })
    await col.deleteOne({ _id: doc._id })
    knowledgeOnLibraryChange('problem', doc.id)
    return NextResponse.json({ success: true, deletedId: doc.slug ?? doc.id })
  } catch (error) {
    console.error('[problems/[slug]]', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}

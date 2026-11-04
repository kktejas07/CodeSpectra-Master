/**
 * POST /api/admin/problems/solutions — generate + verify official solutions.
 *
 * Only what is execution-verified is stored: the model writes a Python
 * solution, every test case is run on the sandbox, and the problem is updated
 * only when all of them pass. Batched so one request stays inside the proxy
 * timeout; call it repeatedly until `remaining` is 0 (superadmin only).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { problems, type ProblemDoc } from '@/lib/db/problems'
import { backendComplete } from '@/lib/ai/backend'
import { executeOnce } from '@/lib/piston'
import { resolveModel } from '@/lib/ai/get-user-model'

export const runtime = 'nodejs'
export const maxDuration = 120

function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/g, '')
}

const SYSTEM = `You write official solutions for competitive-programming problems.
The program reads from STDIN and writes the answer to STDOUT — no prompts, no extra text.
Return STRICT JSON only:
{"explanation_md": "short approach + complexity, markdown", "code": {"python": "<full program>"}}
The Python program must be self-contained (standard library only) and pass every test.`

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })

  let limit = 3
  try {
    const body = (await req.json()) as { limit?: number }
    if (typeof body.limit === 'number' && Number.isFinite(body.limit)) limit = Math.min(10, Math.max(1, Math.floor(body.limit)))
  } catch { /* default limit */ }

  const col = await problems()
  const pending = await col
    .find({ is_published: true, $or: [{ official_solution: { $exists: false } }, { official_solution: null }] }, { projection: { id: 1, slug: 1, title: 1, statement_md: 1, difficulty: 1, test_cases: 1 } })
    .sort({ created_at: 1 })
    .limit(limit)
    .toArray()

  const { providerOverride, modelOverride, modelRole, endpointOverride, apiKeyOverride } = await resolveModel(gate.user.id, 'review_model')
  const results: Array<{ slug: string; ok: boolean; reason?: string }> = []

  for (const doc of pending as Array<Partial<ProblemDoc> & { slug: string }>) {
    const tests = doc.test_cases || []
    try {
      if (tests.length === 0) { results.push({ slug: doc.slug, ok: false, reason: 'no test cases' }); continue }
      const res = await backendComplete({
        systemMessage: SYSTEM,
        userMessage: `Problem: ${doc.title}\n\n${String(doc.statement_md || '').slice(0, 6000)}\n\nWrite the Python solution.`,
        modelRole,
        responseFormat: 'json',
        feature: 'problem-solution',
        userId: gate.user.id,
        cache: false,
        providerOverride,
        modelOverride,
        endpointOverride: endpointOverride || undefined,
        apiKeyOverride,
      })
      const json = (res.json && typeof res.json === 'object' ? res.json : {}) as { explanation_md?: unknown; code?: unknown }
      const codeObj = (json.code && typeof json.code === 'object' ? json.code : {}) as Record<string, unknown>
      const source = typeof codeObj.python === 'string' ? codeObj.python : typeof json.code === 'string' ? json.code : ''
      if (!source) { results.push({ slug: doc.slug, ok: false, reason: 'model returned no code' }); continue }

      let allPassed = true
      for (const tc of tests) {
        const run = await executeOnce({ language: 'python', source, stdin: tc.stdin, timeoutMs: doc.time_limit_ms || 4000 })
        if (run.run.code !== 0 || normalize(run.run.stdout || '') !== normalize(tc.expected_stdout || '')) { allPassed = false; break }
      }
      if (!allPassed) { results.push({ slug: doc.slug, ok: false, reason: 'tests failed' }); continue }

      await col.updateOne(
        { id: doc.id },
        {
          $set: {
            official_solution: {
              explanation_md: String(json.explanation_md || '').slice(0, 8000),
              code: { python: source },
              verified_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          },
        },
      )
      results.push({ slug: doc.slug, ok: true })
    } catch (e) {
      results.push({ slug: doc.slug, ok: false, reason: (e as Error)?.message?.slice(0, 160) || 'error' })
    }
  }

  const remaining = await col.countDocuments({ is_published: true, $or: [{ official_solution: { $exists: false } }, { official_solution: null }] })
  return NextResponse.json({ done: results.filter((r) => r.ok).length, results, remaining })
}

/**
 * Generate coding problems and publish only what the sandbox verified.
 *
 * Reuses the existing pipeline rather than a parallel one:
 *   generateCodingProblem → verifyGeneratedProblem (runs the reference solution
 *   against every test) → saveGeneratedProblem(mode: 'published').
 *
 * `verifyGeneratedProblem` is not a pass/fail gate on its own — with no
 * reference solution it keeps the tests and reports `verified: false`, and it
 * DROPS tests the reference solution failed. So the gate checks `verified === true`
 * AND that enough tests survived; otherwise a problem with zero trustworthy
 * tests would go live.
 */
import {
  generateCodingProblem,
  verifyGeneratedProblem,
  saveGeneratedProblem,
  logGeneratedProblem,
  shapeGeneratedProblem,
  type TestVerification,
} from '@/lib/services/problems'
import { getMongoDb } from '@/lib/mongodb'
import { findTitleOwner } from './uniqueness'
import type { ServiceUser } from '@/lib/services/result'

/** 2 sample + hidden cases; below this a problem can't discriminate. */
export const MIN_VERIFIED_TESTS = 4

export type PublishableResult = { ok: true } | { ok: false; reason: string }

/** Pure gate — the only thing standing between an LLM and a published problem. */
export function problemPublishable(verification: TestVerification, keptTests: number): PublishableResult {
  if (verification.verified !== true) {
    return { ok: false, reason: verification.note || 'reference solution did not reproduce the expected output' }
  }
  if (keptTests < MIN_VERIFIED_TESTS) {
    return { ok: false, reason: `only ${keptTests} verified test(s); need ${MIN_VERIFIED_TESTS}` }
  }
  return { ok: true }
}

export type GeneratedProblemResult =
  | { ok: true; id: string; slug: string; verification: TestVerification }
  | { ok: false; reason: string }

export async function generateVerifiedProblem(opts: {
  user: ServiceUser
  difficulty?: 'easy' | 'medium' | 'hard'
  topics?: string[]
}): Promise<GeneratedProblemResult> {
  const raw = await generateCodingProblem(opts.user.id, {
    difficulty: opts.difficulty,
    topics: opts.topics,
  })
  if (!raw) return { ok: false, reason: 'every provider failed' }

  const { result, verification } = await verifyGeneratedProblem(raw)
  const kept = Array.isArray(result.test_cases) ? result.test_cases.length : 0
  const gate = problemPublishable(verification, kept)

  if (!gate.ok) {
    try { await logGeneratedProblem(opts.user.id, result, null) } catch { /* logging is best effort */ }
    return { ok: false, reason: gate.reason }
  }

  // The same question must not already be on arena/challenges (or here).
  const owner = await findTitleOwner(await getMongoDb(), shapeGeneratedProblem(result).title)
  if (owner) {
    try { await logGeneratedProblem(opts.user.id, result, null) } catch { /* best effort */ }
    return { ok: false, reason: `duplicate title — already on ${owner.collection}` }
  }

  const saved = await saveGeneratedProblem(opts.user, { ...result, tests_verified: true }, { mode: 'published' })
  try { await logGeneratedProblem(opts.user.id, result, saved.id) } catch { /* logging is best effort */ }
  return { ok: true, id: saved.id, slug: saved.slug, verification }
}

/** The account generated platform content is attributed to. */
export function systemPracticeUser(): ServiceUser {
  return { id: 'system:practice-content', email: '', role: 'superadmin', tenantId: null }
}

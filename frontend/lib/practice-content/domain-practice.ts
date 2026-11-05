/**
 * Industry / tech-stack / level practice problems — the SERVER brain.
 *
 * Turns a catalog coordinate into verified, publishable coding problems on
 * top of the existing pipeline (generateVerifiedProblem → LLM → piston
 * sandbox verification → publish). The spec builder is client-safe and lives
 * in domain-spec.ts (this module imports the whole AI/piston chain and is
 * server-only in practice — API routes and scripts load it, never UI).
 *
 * Shared by the admin bulk generator and the learner practice page so they
 * behave identically (same spec, same gate, same publish).
 */
import { generateVerifiedProblem, type GeneratedProblemResult } from './problems-generate'
import type { ServiceUser } from '@/lib/services/result'
import { COURSE_LEVELS, INDUSTRIES, subjectsForIndustry, type IndustryId } from '@/lib/courses/catalog'
export {
  PRACTICE_DIFFICULTY,
  buildDomainPracticeSpec,
  type DomainPracticeSpec,
  type Level,
} from './domain-spec'

export { COURSE_LEVELS, INDUSTRIES, subjectsForIndustry }
export type { IndustryId }

type OkResult = Extract<GeneratedProblemResult, { ok: true }>

export type DomainProblemResult =
  | (OkResult & { spec: import('./domain-spec').DomainPracticeSpec })
  | { ok: false; reason: string; spec: import('./domain-spec').DomainPracticeSpec }

/**
 * Generate `count` verified problems for a spec. Each is independently gated
 * (reference solution must pass every test) and published; failures are
 * collected, not fatal — a set of 5 with 1 provider hiccup returns the 4 that
 * held up.
 */
export async function generateDomainProblemSet(
  user: ServiceUser,
  spec: import('./domain-spec').DomainPracticeSpec,
  count: number,
): Promise<DomainProblemResult[]> {
  const n = Math.max(1, Math.min(10, count))
  const results: DomainProblemResult[] = []
  // Sequential: each publish dedupes against the library, and the piston
  // sandbox + LLM are shared-rate-limited. 5–10 problems is a short burst.
  for (let i = 0; i < n; i++) {
    let r: GeneratedProblemResult
    try {
      r = await generateVerifiedProblem({
        user,
        difficulty: spec.difficulty,
        topics: spec.topics,
        role: spec.role,
        industry: spec.industryLabel,
        tech_stack: spec.techStack,
        level: spec.level,
      })
    } catch (e) {
      r = { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
    results.push({ ...r, spec })
  }
  return results
}

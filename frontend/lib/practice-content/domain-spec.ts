/**
 * Industry / tech-stack / level practice problem specs — CLIENT-SAFE.
 *
 * Pure data (the course catalog) → a concrete generation spec. No imports
 * beyond lib/courses/catalog, so UI components can preview the spec without
 * dragging the server-only AI/piston pipeline into the client bundle
 * (domain-practice.ts is the server brain and re-exports this).
 */
import { COURSE_LEVELS, INDUSTRIES, trackFor, type IndustryId } from '@/lib/courses/catalog'

export const PRACTICE_DIFFICULTY: Record<(typeof COURSE_LEVELS)[number], 'easy' | 'medium' | 'hard'> = {
  // ponytail: the 4-level course ladder maps onto the 3-level code difficulty
  // the same way the problems viewmodel does (expert folds into hard).
  Beginner: 'easy',
  Intermediate: 'medium',
  Advanced: 'hard',
  Expert: 'hard',
}

export type Level = (typeof COURSE_LEVELS)[number]

export interface DomainPracticeSpec {
  /** Catalog industry (id + label) the problem is grounded in. */
  industry: IndustryId
  industryLabel: string
  /** The subject / tech stack name. */
  techStack: string
  /** Course level (beginner…expert). */
  level: Level
  /** DB difficulty the code problem targets. */
  difficulty: 'easy' | 'medium' | 'hard'
  /** Domain topics to condition the problem on (track modules). */
  topics: string[]
  /** The role line fed to the generator, e.g. "Cloud & DevOps Advanced Kubernetes engineer". */
  role: string
  /** Human-readable set title. */
  title: string
}

function industryLabel(id: IndustryId): string {
  return INDUSTRIES.find(i => i.id === id)?.label || id
}

function levelFrom(raw: unknown): Level {
  const v = String(raw || '').trim()
  return (COURSE_LEVELS as readonly string[]).includes(v) ? (v as Level) : 'Beginner'
}

/** Build a concrete generation spec from a catalog coordinate. */
export function buildDomainPracticeSpec(
  industry: IndustryId,
  techStack: string,
  level: Level,
): DomainPracticeSpec {
  const indLabel = industryLabel(industry)
  const lv = levelFrom(level)
  // Topics: the track's module list for this subject+level — these are the
  // domain concepts a problem should touch. Fall back to the subject name.
  let topics: string[] = []
  try {
    topics = trackFor(techStack, lv).modules.slice(0, 5)
  } catch {
    topics = []
  }
  if (!topics.length) topics = [techStack]
  return {
    industry,
    industryLabel: indLabel,
    techStack,
    level: lv,
    difficulty: PRACTICE_DIFFICULTY[lv],
    topics,
    role: `${indLabel} ${lv} ${techStack} engineer`,
    title: `${techStack} — ${lv} (${indLabel})`,
  }
}

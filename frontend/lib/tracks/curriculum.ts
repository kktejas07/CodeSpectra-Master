/**
 * Track curricula.
 *
 * Tracks used to be tag presets: a card said "12 problems" and Practice just
 * linked to /dashboard/problems?topics=… with no order, no lessons and no
 * progression — thin enough to read as demo content (2026-10-30).
 *
 * A track is now three ordered modules with a stated objective. Each module maps
 * to real problems (`problems.topics`) and to real Learn posts
 * (`learn_posts.tags`), so the counts on the card are honest.
 *
 * Two separate vocabularies on purpose:
 *   topics    — problem topics, e.g. "Hash Map", "Dynamic Programming"
 *   learnTags — the lowercase tags Learn posts actually carry
 * A mismatch shows as 0, never as fake content.
 */

export type TrackLevel = 'easy' | 'medium' | 'hard'

export interface TrackModule {
  id: string
  title: string
  objective: string
  /** Matched case-insensitively against problem topics. */
  topics: string[]
  /** Matched against learn-post tags. Empty = this track has no lessons yet. */
  learnTags: string[]
  levels: TrackLevel[]
}

const PROBLEM_LADDER = {
  foundations: ['Arrays', 'Strings', 'Loops', 'Conditionals'],
  patterns: ['Hash Map', 'Two Pointers', 'Sorting', 'Linked List'],
  interview: ['Dynamic Programming', 'Trees', 'Graphs', 'Binary Search'],
}

/** Language tracks add their own tag so language-specific posts count. */
function languageModules(language?: string): TrackModule[] {
  const lang = language ? [language] : []
  return [
    { id: 'foundations', title: 'Foundations', objective: 'Get fluent with arrays, strings and the syntax you use every day.', topics: PROBLEM_LADDER.foundations, learnTags: [...lang, 'programming', 'basics', 'arrays'], levels: ['easy'] },
    { id: 'patterns', title: 'Core patterns', objective: 'Hash maps, two pointers and sorting — the patterns interviews reuse.', topics: PROBLEM_LADDER.patterns, learnTags: [...lang, 'algorithms', 'sorting', 'data-structures'], levels: ['easy', 'medium'] },
    { id: 'interview', title: 'Interview readiness', objective: 'Dynamic programming, trees and graphs under time pressure.', topics: PROBLEM_LADDER.interview, learnTags: [...lang, 'graphs', 'performance', 'algorithms'], levels: ['medium', 'hard'] },
  ]
}

export const TRACK_CURRICULUM: Record<string, TrackModule[]> = {
  python: languageModules('python'),
  javascript: languageModules('javascript'),
  typescript: languageModules('javascript'),
  java: languageModules('java'),
  cpp: languageModules(),
  node: languageModules('javascript'),
  react: languageModules('javascript'),
  dsa: [
    { id: 'structures', title: 'Data structures', objective: 'Arrays, linked lists, stacks, queues and trees — when each is the right tool.', topics: ['Arrays', 'Linked List', 'Stack', 'Trees'], learnTags: ['data-structures', 'arrays', 'basics'], levels: ['easy'] },
    { id: 'algorithms', title: 'Algorithmic technique', objective: 'Sorting, binary search, recursion and greedy reasoning.', topics: ['Sorting', 'Binary Search', 'Recursion', 'Greedy'], learnTags: ['algorithms', 'sorting', 'searching', 'performance'], levels: ['easy', 'medium'] },
    { id: 'advanced', title: 'Interview hard', objective: 'Dynamic programming, graphs and bit manipulation.', topics: ['Dynamic Programming', 'Graphs', 'Bit Manipulation'], learnTags: ['graphs', 'algorithms', 'performance'], levels: ['medium', 'hard'] },
  ],
  sql: [
    // No SQL lessons exist yet — counting a generic 'systems' post here would be a lie.
    { id: 'querying', title: 'Querying', objective: 'SELECT, filtering and joins on real tables.', topics: ['SQL', 'SELECT', 'JOINs'], learnTags: [], levels: ['easy'] },
    { id: 'shaping', title: 'Shaping results', objective: 'Aggregation, CTEs and window functions.', topics: ['SQL', 'Window fns', 'CTEs'], learnTags: [], levels: ['medium'] },
    { id: 'performance', title: 'Performance', objective: 'Indexes and query plans — why a query is slow.', topics: ['SQL', 'Indexes'], learnTags: [], levels: ['hard'] },
  ],
  system_design: [
    { id: 'basics', title: 'Building blocks', objective: 'Caching, queues and the vocabulary interviewers expect.', topics: ['Design', 'Caching', 'Queues'], learnTags: ['systems', 'scalability', 'cloud'], levels: ['medium'] },
    { id: 'scale', title: 'Scaling', objective: 'Sharding, consistency and rate limiting under load.', topics: ['Design', 'Sharding', 'Consistency', 'Rate limits'], learnTags: ['scalability', 'systems', 'concurrency'], levels: ['medium', 'hard'] },
    { id: 'case-study', title: 'End-to-end design', objective: 'Design a full system and defend the trade-offs.', topics: ['Design', 'System Design'], learnTags: ['systems', 'performance'], levels: ['hard'] },
  ],
}

/** Modules for a track, falling back to the generic language ladder. */
export function modulesForTrack(trackId: string): TrackModule[] {
  return TRACK_CURRICULUM[trackId] ?? languageModules()
}

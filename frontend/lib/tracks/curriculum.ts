/**
 * Track curricula.
 *
 * Tracks used to be tag presets: a card said "12 problems" and Practice just
 * linked to /dashboard/problems?topics=… with no order, no lessons and no
 * progression — thin enough to read as demo content (2026-10-30).
 *
 * A track is now three ordered modules with a stated objective. Each module maps
 * to real problems (by topic) and to real Learn posts (by tag), so the counts on
 * the card are honest and a learner has an order to follow.
 *
 * Topics deliberately use the SAME vocabulary as `problems.topics` and
 * `learn_posts.tags` — a mismatch shows up as a permanent "0 problems".
 */

export type TrackLevel = 'easy' | 'medium' | 'hard'

export interface TrackModule {
  id: string
  title: string
  objective: string
  /** Matched case-insensitively against problem topics and learn-post tags. */
  topics: string[]
  /** Target difficulty ramp for the module. */
  levels: TrackLevel[]
}

const LANGUAGE_MODULES: TrackModule[] = [
  { id: 'foundations', title: 'Foundations', objective: 'Get fluent with arrays, strings and the syntax you will use every day.', topics: ['Arrays', 'Strings', 'Loops', 'Conditionals'], levels: ['easy'] },
  { id: 'patterns', title: 'Core patterns', objective: 'Hash maps, two pointers and sorting — the patterns most interviews reuse.', topics: ['Hash Map', 'Two Pointers', 'Sorting', 'Linked List'], levels: ['easy', 'medium'] },
  { id: 'interview', title: 'Interview readiness', objective: 'Dynamic programming, trees and graphs under time pressure.', topics: ['Dynamic Programming', 'Trees', 'Graphs', 'Binary Search'], levels: ['medium', 'hard'] },
]

export const TRACK_CURRICULUM: Record<string, TrackModule[]> = {
  python: LANGUAGE_MODULES,
  javascript: LANGUAGE_MODULES,
  typescript: LANGUAGE_MODULES,
  java: LANGUAGE_MODULES,
  cpp: LANGUAGE_MODULES,
  node: LANGUAGE_MODULES,
  react: LANGUAGE_MODULES,
  dsa: [
    { id: 'structures', title: 'Data structures', objective: 'Arrays, linked lists, stacks, queues and trees — when each one is the right tool.', topics: ['Arrays', 'Linked List', 'Stack', 'Trees'], levels: ['easy'] },
    { id: 'algorithms', title: 'Algorithmic technique', objective: 'Sorting, binary search, recursion and greedy reasoning.', topics: ['Sorting', 'Binary Search', 'Recursion', 'Greedy'], levels: ['easy', 'medium'] },
    { id: 'advanced', title: 'Interview hard', objective: 'Dynamic programming, graphs and bit manipulation.', topics: ['Dynamic Programming', 'Graphs', 'Bit Manipulation'], levels: ['medium', 'hard'] },
  ],
  sql: [
    { id: 'querying', title: 'Querying', objective: 'SELECT, filtering and joins on real tables.', topics: ['SQL', 'SELECT', 'JOINs'], levels: ['easy'] },
    { id: 'shaping', title: 'Shaping results', objective: 'Aggregation, CTEs and window functions.', topics: ['SQL', 'Window fns', 'CTEs'], levels: ['medium'] },
    { id: 'performance', title: 'Performance', objective: 'Indexes and query plans — why a query is slow.', topics: ['SQL', 'Indexes'], levels: ['hard'] },
  ],
  system_design: [
    { id: 'basics', title: 'Building blocks', objective: 'Caching, queues and the vocabulary interviewers expect.', topics: ['Design', 'Caching', 'Queues'], levels: ['medium'] },
    { id: 'scale', title: 'Scaling', objective: 'Sharding, consistency and rate limiting under load.', topics: ['Design', 'Sharding', 'Consistency', 'Rate limits'], levels: ['medium', 'hard'] },
    { id: 'case-study', title: 'End-to-end design', objective: 'Design a full system and defend the trade-offs.', topics: ['Design', 'System Design'], levels: ['hard'] },
  ],
}

/** Modules for a track, falling back to the language ladder for unknown ids. */
export function modulesForTrack(trackId: string): TrackModule[] {
  return TRACK_CURRICULUM[trackId] ?? LANGUAGE_MODULES
}

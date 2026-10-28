/**
 * 100-day sprint progress maths (pure). Progress is derived from the set of
 * problem ids the server has seen accepted (see /api/arena/run with
 * `hundred_days_problem_id`), never from numbers the client sends.
 */
import type { HundredDay } from '@/lib/100-days-data'

type DayLike = Pick<HundredDay, 'day'> & { problems: Array<{ id: string; difficulty: 'easy' | 'medium' | 'hard' }> }

/** Days whose every problem is solved, ascending. */
export function completedDaysFrom(solved: Iterable<string>, days: DayLike[]): number[] {
  const set = new Set(solved)
  return days
    .filter((d) => d.problems.length > 0 && d.problems.every((p) => set.has(p.id)))
    .map((d) => d.day)
    .sort((a, b) => a - b)
}

/** Consecutive completed days counted from Day 1 (days unlock in order). */
export function sprintRun(completedDays: Iterable<number>): number {
  const set = new Set(completedDays)
  let n = 0
  while (set.has(n + 1)) n++
  return n
}

export interface DifficultyTally { solved: number; total: number }

export function difficultyTotals(
  solved: Iterable<string>,
  days: DayLike[],
): Record<'easy' | 'medium' | 'hard', DifficultyTally> & { all: DifficultyTally } {
  const set = new Set(solved)
  const out = {
    easy: { solved: 0, total: 0 },
    medium: { solved: 0, total: 0 },
    hard: { solved: 0, total: 0 },
    all: { solved: 0, total: 0 },
  }
  for (const d of days) {
    for (const p of d.problems) {
      out[p.difficulty].total++
      out.all.total++
      if (set.has(p.id)) {
        out[p.difficulty].solved++
        out.all.solved++
      }
    }
  }
  return out
}

/** Find a sprint problem (and its day) by id. */
export function findSprintProblem<T extends DayLike>(id: string, days: T[]): { day: T; problem: T['problems'][number] } | null {
  for (const d of days) {
    const p = d.problems.find((x) => x.id === id)
    if (p) return { day: d, problem: p }
  }
  return null
}

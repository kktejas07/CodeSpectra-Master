/**
 * CORE-048: progress of a company-practice assignment (pure). A student has
 * done the assignment when they completed an attempt of the assigned company
 * test pattern after it was assigned; an attempt still open counts as started.
 */

export interface AssignmentAttempt { userId: string; patternId: string; status: string; createdAt: string }
export interface AssignmentStudent { student_id: string; user_id: string; name: string }

export interface AssignmentProgress {
  total: number
  completed: number
  started: number
  pending: number
  /** Students who have not completed it yet (names for the officer; capped). */
  pending_students: Array<{ student_id: string; name: string; started: boolean }>
}

export function assignmentProgress(
  a: { pattern_id: string; created_at: string },
  students: readonly AssignmentStudent[],
  attempts: readonly AssignmentAttempt[],
  cap = 50,
): AssignmentProgress {
  const since = Date.parse(a.created_at)
  const done = new Set<string>()
  const open = new Set<string>()
  for (const t of attempts) {
    if (t.patternId !== a.pattern_id) continue
    const at = Date.parse(t.createdAt)
    if (Number.isFinite(since) && Number.isFinite(at) && at < since) continue
    if (t.status === 'completed') done.add(t.userId)
    else open.add(t.userId)
  }
  const pending = students.filter((s) => !done.has(s.user_id))
  return {
    total: students.length,
    completed: students.length - pending.length,
    started: pending.filter((s) => open.has(s.user_id)).length,
    pending: pending.length,
    pending_students: pending.slice(0, cap).map((s) => ({ student_id: s.student_id, name: s.name, started: open.has(s.user_id) })),
  }
}

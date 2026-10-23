/**
 * SEC-037 follow-up (owner decision): problems that learner accounts published
 * before the admin-only publish gate go back to review. Pure selection rules,
 * client-safe; the job itself is lib/problems/learner-review.ts.
 *
 * Who keeps a published problem:
 *   superadmin, tenant_admin  platform / organisation admins
 *   judge                     event staff (the only staff role in lib/types/rbac-types.ts;
 *                             there is no separate content-reviewer role)
 * Everyone else — 'user' (learners), unknown roles, and creators whose account
 * no longer exists — goes back to 'pending_review'. Seed / platform problems
 * without `created_by` are never touched. hackathon_only problems are left as
 * they are: they are not in the public library and their visibility is gated
 * by the event, not by `is_published`.
 */

export const ONE_TIME_JOB_ID = 'sec037-learner-problems-review'
export const PROBLEM_REVIEW_PENDING = 'pending_review' as const
export const PROBLEM_REVIEW_APPROVED = 'approved' as const

export const PRIVILEGED_PROBLEM_AUTHOR_ROLES: ReadonlySet<string> = new Set(['superadmin', 'tenant_admin', 'judge'])

export interface ProblemAuthorRow {
  /** Mongo _id (used for the update). */
  _id: unknown
  id?: string | null
  slug?: string | null
  created_by?: string | null
  is_published?: boolean
  visibility?: string | null
}

/** Pure: the creator ids to look up (non-empty strings, de-duplicated). */
export function creatorIds(rows: readonly ProblemAuthorRow[]): string[] {
  const out = new Set<string>()
  for (const r of rows) if (typeof r.created_by === 'string' && r.created_by.trim()) out.add(r.created_by.trim())
  return [...out]
}

/**
 * Pure: the rows to send back to review. `roles` maps an existing account id
 * to its role (null/empty role = learner); an id missing from the map means
 * the account no longer exists.
 */
export function selectLearnerProblems(rows: readonly ProblemAuthorRow[], roles: ReadonlyMap<string, string | null | undefined>): ProblemAuthorRow[] {
  return rows.filter((r) => {
    if (r.is_published === false) return false
    if (r.visibility === 'hackathon_only') return false
    const by = typeof r.created_by === 'string' ? r.created_by.trim() : ''
    if (!by) return false // seed / platform problem
    if (!roles.has(by)) return true // creator deleted
    return !PRIVILEGED_PROBLEM_AUTHOR_ROLES.has(String(roles.get(by) || 'user'))
  })
}

/** Pure: the id the knowledge index uses for a problem (id, else slug). */
export function problemKnowledgeId(r: Pick<ProblemAuthorRow, 'id' | 'slug'>): string | null {
  return (typeof r.id === 'string' && r.id) || (typeof r.slug === 'string' && r.slug) || null
}

/** Pure: audit detail with ids only (no titles, no creator ids), capped. */
export function auditDetail(ids: readonly string[], cap = 60): string {
  const shown = ids.slice(0, cap).join(',')
  const more = ids.length > cap ? ` +${ids.length - cap} more` : ''
  return `count=${ids.length}${ids.length ? ` ids=${shown}${more}` : ''}`
}

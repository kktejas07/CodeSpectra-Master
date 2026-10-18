/**
 * Tenant scoping for hackathon / codeathon admin (pure, no I/O).
 *
 * - Company admins (tenant_admin) only ever see and manage their own
 *   organization's events. A tenant_admin without a tenantId owns nothing.
 * - Superadmin sees everything, optionally narrowed with `?tenant=`
 *   ('global' = platform events with no organization, or a tenant id).
 * - Problems: a company admin may put platform (global) problems and their
 *   own organization's problems into an event, and edit only their own.
 */
type Who = { role?: string | null; tenantId?: string | null; id?: string | null } | null | undefined

const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/

/** Mongo filter for an admin event list. Non-admins get {} (callers add their own public rules). */
export function eventListTenantFilter(user: Who, requested?: string | null): Record<string, unknown> {
  if (!user) return {}
  if (user.role === 'tenant_admin') {
    return user.tenantId ? { tenant_id: user.tenantId } : { _id: null } // deny by default
  }
  if (user.role === 'superadmin') {
    const t = (requested || '').trim()
    if (t === 'global') return { tenant_id: null } // matches null and missing
    if (t && TENANT_ID_RE.test(t)) return { tenant_id: t }
  }
  return {}
}

type ProblemLike = { tenant_id?: string | null; created_by?: string | null } | null | undefined

/** May this user put the problem into an event they run? */
export function canUseProblem(user: Who, problem: ProblemLike): boolean {
  if (!user || !problem) return false
  if (user.role === 'superadmin') return true
  if (user.role !== 'tenant_admin') return false
  const owner = typeof problem.tenant_id === 'string' && problem.tenant_id ? problem.tenant_id : null
  if (!owner) return true // platform problem
  return !!user.tenantId && owner === user.tenantId
}

/** May this user edit the problem itself? Same rule as PATCH /api/problems/[slug]. */
export function canEditProblemAsAdmin(user: Who, problem: ProblemLike): boolean {
  if (!user || !problem) return false
  if (user.role === 'superadmin') return true
  if (problem.created_by && user.id && problem.created_by === user.id) return true
  return user.role === 'tenant_admin' && !!user.tenantId && !!problem.tenant_id && problem.tenant_id === user.tenantId
}

/**
 * Slugs a company admin may not use in their event: unknown slugs and other
 * organizations' problems. Empty for superadmin.
 */
export function unusableProblemSlugs(
  user: Who,
  slugs: readonly string[],
  found: ReadonlyArray<{ slug?: string | null; id?: string | null; tenant_id?: string | null }>,
): string[] {
  if (user?.role === 'superadmin') return []
  const bySlug = new Map<string, { tenant_id?: string | null }>()
  for (const p of found) {
    if (p.slug) bySlug.set(p.slug, p)
    if (p.id) bySlug.set(p.id, p)
  }
  return [...new Set(slugs.filter(Boolean))].filter((s) => {
    const p = bySlug.get(s)
    return !p || !canUseProblem(user, p)
  })
}

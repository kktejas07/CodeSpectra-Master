/**
 * Server-side checks for company admins (tenant_admin) editing hackathons:
 * problems must be platform or own-organization problems, and new judges
 * must belong to the admin's organization. Superadmin is unrestricted.
 */
import type { APIUser } from '@/lib/route-auth'
import { unusableProblemSlugs } from './tenant-scope'

type Who = Pick<APIUser, 'id' | 'role' | 'tenantId'>

/** Error message when a task uses a problem this admin may not use, else null. */
export async function checkTaskProblems(user: Who, slugs: string[]): Promise<string | null> {
  if (user.role === 'superadmin') return null
  const wanted = [...new Set(slugs.filter((s) => typeof s === 'string' && s))]
  if (wanted.length === 0) return null
  const { problems } = await import('@/lib/db/problems')
  const found = await (await problems())
    .find({ $or: [{ slug: { $in: wanted } }, { id: { $in: wanted } }] } as Record<string, unknown>, { projection: { _id: 0, slug: 1, id: 1, tenant_id: 1 } })
    .toArray()
  const bad = unusableProblemSlugs(user, wanted, found as Array<{ slug?: string; id?: string; tenant_id?: string | null }>)
  return bad.length > 0
    ? 'You can use platform problems and your organization’s problems only.'
    : null
}

/** Error message when a newly added judge is outside this admin's organization, else null. */
export async function checkNewJudges(user: Who, next: string[], current: readonly string[] = []): Promise<string | null> {
  if (user.role === 'superadmin') return null
  const added = [...new Set(next)].filter((j) => !current.includes(j))
  if (added.length === 0) return null
  if (!user.tenantId) return 'Forbidden'
  const { users } = await import('@/lib/db/admin')
  const n = await (await users()).countDocuments({
    $and: [
      { $or: [{ id: { $in: added } }, { _id: { $in: added } }] },
      { $or: [{ tenantId: user.tenantId }, { organizationId: user.tenantId }] },
    ],
  } as Record<string, unknown>)
  return n === added.length ? null : 'Judges must be members of your organization.'
}

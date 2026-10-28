/**
 * SEC-029 root gate: every /api/admin/** request from an admin who still owes
 * two-factor (past the grace period) is refused in the proxy, whatever guard
 * the route itself uses. Route guards (requireAdmin / requireSuperAdmin /
 * isAdminCaller …) stay the primary check; this layer catches a route that
 * forgets them. tests/admin-2fa-guard.test.ts keeps both layers honest.
 */
// route-auth is loaded lazily so the proxy's path check stays cheap.

/** Admin API paths that must stay reachable without admin 2FA. */
const EXEMPT = new Set<string>([
  // Restores the admin's own session after "view as"; carries no admin power.
  '/api/admin/impersonate/stop',
])

export function isAdminApiPath(pathname: string): boolean {
  if (pathname !== '/api/admin' && !pathname.startsWith('/api/admin/')) return false
  return !EXEMPT.has(pathname.replace(/\/+$/, ''))
}

export const ADMIN_2FA_BODY = {
  error: 'Turn on two-factor authentication to use admin tools (Account → Security).',
  code: 'admin_2fa_required',
} as const

/**
 * True when the caller is an admin who owes 2FA. Fails open (false) when the
 * caller can't be resolved — the route's own guard still runs and denies.
 */
export async function adminApi2faBlocked(input: { sessionCookie?: string | null; authorization?: string | null }): Promise<boolean> {
  if (!input.sessionCookie && !input.authorization?.startsWith('Bearer ')) return false
  try {
    const { getUserFromCredentials } = await import('@/lib/route-auth')
    const user = await getUserFromCredentials({ sessionCookie: input.sessionCookie, authorization: input.authorization })
    return !!user?.adminTwoFactorRequired
  } catch {
    return false
  }
}

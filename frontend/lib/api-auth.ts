/**
 * Re-exports route-handler auth helpers.
 * Implementation lives in `./route-auth` so this file stays a tiny surface
 * (avoids Turbopack treating mixed sync/async exports as Server Actions).
 */
export type { UserRole, APIUser } from './route-auth'
export { getAPIUser, requireAuth, requireAdmin, requireSuperAdmin } from './route-auth'

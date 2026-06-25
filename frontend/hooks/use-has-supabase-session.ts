'use client'

import { authClient } from '@/lib/auth-client'

/**
 * Tracks whether the browser has a valid session.
 *
 * Phase 7 migration: now backed by Better Auth's `useSession()`.
 * The name is preserved for landing/nav components that still import it.
 */
export function useHasSupabaseSession(): boolean | null {
  const { data, isPending } = authClient.useSession()
  if (isPending) return null
  return Boolean(data?.user)
}

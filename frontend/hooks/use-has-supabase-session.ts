'use client'

import { useAuth } from '@/lib/auth-context'

export function useHasSupabaseSession(): boolean | null {
  const { user, loading } = useAuth()
  if (loading) return null
  return Boolean(user)
}

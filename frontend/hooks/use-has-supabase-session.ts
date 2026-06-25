'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'

/**
 * Tracks whether the browser has a valid Supabase session (cookies).
 * Subscribes to auth changes so landing/public nav updates after sign-in/out.
 */
export function useHasSupabaseSession() {
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!cancelled) setHasSession(Boolean(data.session))
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session))
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  return hasSession
}

'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'

const HEARTBEAT_MS = 45_000

/**
 * Periodically bumps `profiles.updated_at` so “last active” style metrics stay fresh
 * (works without a dedicated `last_seen_at` column). Safe to mount once for all dashboard pages.
 */
export function ActivityHeartbeat() {
  useEffect(() => {
    let cancelled = false

    const ping = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('profiles')
        .update({ updated_at: now })
        .eq('id', user.id)
      if (error) {
        // Missing profile, RLS, or column not migrated yet — ignore
      }
    }

    void ping()
    const id = window.setInterval(() => void ping(), HEARTBEAT_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void ping()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return null
}

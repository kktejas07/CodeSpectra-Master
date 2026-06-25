/**
 * Phase 7 stub — legacy Supabase service-role client.
 * Anything calling `getServiceSupabase()` is dead code that needs to be
 * migrated to MongoDB; this returns `null` so the legacy `if (!supabase)
 * return 503` branch fires cleanly.
 */

export function getServiceSupabase(): null {
  return null
}

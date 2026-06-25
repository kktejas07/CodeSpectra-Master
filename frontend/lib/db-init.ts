/**
 * Phase 7 stub — `initializeDatabase` used to run Supabase migrations + seeds.
 * On MongoDB, collections are created lazily on first write. This is a no-op.
 */
export async function initializeDatabase() {
  return { ok: true }
}

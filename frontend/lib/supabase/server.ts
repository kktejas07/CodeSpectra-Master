/**
 * Phase 7 no-op shim for the alternative `@/lib/supabase/server` path
 * used by a few team-route helpers. See `lib/supabase-client.ts` for context.
 */

const DEAD_ERR =
  'Supabase server client was removed. Use Better Auth + MongoDB instead.'

function makeDeadProxy(): unknown {
  return new Proxy(
    () => {
      throw new Error(DEAD_ERR)
    },
    {
      get() {
        return makeDeadProxy()
      },
      apply() {
        throw new Error(DEAD_ERR)
      },
    },
  )
}

export async function createClient() {
  return makeDeadProxy() as never
}

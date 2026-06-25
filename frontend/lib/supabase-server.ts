/**
 * Phase 7 no-op shim. See `lib/supabase-client.ts` for context.
 */

const DEAD_ERR =
  'Supabase server client was removed in the MongoDB migration. ' +
  "Use '@/lib/route-auth' (requireAuth/getAPIUser) and the MongoDB " +
  "repositories under '@/lib/db/*' instead."

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

export async function createRouteHandlerSupabase() {
  return makeDeadProxy() as never
}

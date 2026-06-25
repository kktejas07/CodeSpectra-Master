/**
 * Phase 7 no-op Supabase shim.
 *
 * The CodeSpectra MongoDB migration removed all backend Supabase usage.
 * A small number of legacy frontend pages and lib helpers still import
 * `supabase` / `supabaseServer` from this file. To keep `next build` green
 * without immediately deleting those callers, this file exports an empty
 * proxy: every method/property access throws a clear runtime error
 * directing the developer to the new MongoDB / Better Auth replacement.
 *
 * To complete cleanup, search for `supabase-client` imports and replace
 * each with a `fetch('/api/…')` call against the new MongoDB-backed routes.
 */

const DEAD_ERR =
  'Supabase was removed in Phase 7 of the MongoDB migration. Replace this call ' +
  'with a fetch() to the matching /api/* endpoint, or use Better Auth from ' +
  "'@/lib/auth-client'."

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

// `as never` lets callers keep their original `SupabaseClient`-typed bindings
// without leaking the dead proxy's intentional `any`-ness into their types.
export const supabase = makeDeadProxy() as never
export const supabaseServer = makeDeadProxy() as never
export default supabase

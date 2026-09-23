/**
 * Shared avatar helpers — pure, server-safe (no JSX).
 * Single source of truth for the DiceBear fallback every page used to
 * hand-roll: `https://api.dicebear.com/7.x/avataaars/svg?seed=…`.
 * UI lives in components/ui/user-avatar.tsx; API routes import from here.
 */

/** Deterministic DiceBear fallback URL for a seed (email, id, or name). */
export function dicebearUrl(seed?: string | null): string {
  const s = (seed || '').trim() || 'x'
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(s)}`
}

/** "Ada Lovelace" → "AL", "plato" → "PL", "" → "?". Null-safe. */
export function initialsFor(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

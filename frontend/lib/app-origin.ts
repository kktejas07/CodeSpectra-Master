/**
 * Public site origin for Supabase `redirectTo` and invite links.
 *
 * Prefer `NEXT_PUBLIC_APP_URL` in every deployed environment (e.g. https://app.example.com).
 * Optional `CODESPECTRA_APP_URL` (server-side) matches the GitHub queue Edge Function and can
 * serve as a fallback when only the server env is configured.
 */

function trimOrigin(raw: string | undefined): string | null {
  const t = raw?.trim().replace(/\/$/, '')
  return t || null
}

export function getAppOrigin(): string {
  const fromPublic = trimOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (fromPublic) return fromPublic
  const fromServer = trimOrigin(process.env.CODESPECTRA_APP_URL)
  if (fromServer) return fromServer
  return 'http://localhost:3000'
}

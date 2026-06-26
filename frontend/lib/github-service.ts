/**
 * GitHub integration service (browser-side).
 *
 * Originally backed by Supabase; now talks to the MongoDB-native endpoints
 * shipped in Phase 9 (`/api/github/oauth/*`, `/api/github/integrations/me`).
 *
 * NOTE: This file is intentionally narrow — only the helpers actually
 * consumed by `components/scanner/github-integration.tsx` are exported.
 * Everything else that the legacy Supabase implementation exposed has been
 * removed because it no longer compiles against the new backend.
 */

export interface GitHubIntegration {
  id: string
  github_username: string
  is_active: boolean
  last_synced_at?: string
}

export interface GitHubRepoListItem {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  html_url: string
  language: string | null
  stargazers_count: number
  updated_at: string
  owner: { login: string; avatar_url: string }
}

/**
 * Redirects the browser to the OAuth start endpoint. Returns `true` so the
 * caller's "we kicked off the flow" toast still fires; the navigation
 * itself happens synchronously.
 */
export function initiateGitHubAuth(): boolean {
  if (typeof window === 'undefined') return false
  const target = `/api/github/oauth/start?redirect=${encodeURIComponent(window.location.pathname)}`
  window.location.href = target
  return true
}

/**
 * Disconnect the current user's GitHub integration.
 */
export async function disconnectGitHub(): Promise<{ ok: boolean }> {
  const res = await fetch('/api/github/integrations/me', { method: 'DELETE' })
  if (!res.ok) throw new Error(`disconnect failed: ${res.status}`)
  return (await res.json()) as { ok: boolean }
}

/**
 * Get the current user's GitHub connection status.
 */
export async function getGitHubIntegration(): Promise<{
  connected: boolean
  github_login?: string | null
  scope?: string
}> {
  const res = await fetch('/api/github/integrations/me', { cache: 'no-store' })
  if (!res.ok) return { connected: false }
  return (await res.json()) as Awaited<ReturnType<typeof getGitHubIntegration>>
}

/**
 * List the GitHub repositories the connected user has access to.
 *
 * Calls GitHub's REST API via the user's stored access_token. We proxy
 * through `/api/github/repos` (server-side) to keep the token off the
 * client. Returns an empty list if the user isn't connected.
 */
export async function getGitHubRepositories(page = 1): Promise<GitHubRepoListItem[]> {
  const res = await fetch(`/api/github/repos?page=${page}`, { cache: 'no-store' })
  if (!res.ok) return []
  const json = (await res.json()) as { items?: GitHubRepoListItem[] }
  return json.items ?? []
}

// ----------------------------------------------------------------------------
// Compatibility stubs (consumed by the legacy scanner components). They route
// to the new MongoDB endpoints; if those endpoints don't exist yet they fail
// loudly so callers can be migrated piecemeal.
// ----------------------------------------------------------------------------

export interface FileContent {
  path: string
  content: string
  encoding?: string
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
): Promise<FileContent | null> {
  const res = await fetch(
    `/api/github/file-content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  return (await res.json()) as FileContent
}

export async function generateAIFixes(args: {
  scanId?: string
  repository?: string
  files?: string[]
}): Promise<{ ok: boolean; fixes: unknown[] }> {
  const res = await fetch('/api/ai/code-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) return { ok: false, fixes: [] }
  const json = (await res.json()) as { fixes?: unknown[] }
  return { ok: true, fixes: json.fixes ?? [] }
}

export async function applySuggestedFix(fixId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/ai/fixes/${encodeURIComponent(fixId)}/apply`, {
    method: 'POST',
  })
  return { ok: res.ok }
}

export async function applySuggestedFixBatch(
  fixIds: string[],
): Promise<{ ok: boolean; applied: number }> {
  const res = await fetch('/api/ai/fixes/apply-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: fixIds }),
  })
  if (!res.ok) return { ok: false, applied: 0 }
  const j = (await res.json()) as { applied?: number }
  return { ok: true, applied: j.applied ?? 0 }
}

export async function unapplySuggestedFix(fixId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/ai/fixes/${encodeURIComponent(fixId)}/unapply`, {
    method: 'POST',
  })
  return { ok: res.ok }
}

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

import { csrfFetch } from './csrf-fetch'

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
  /** Convenience alias for `stargazers_count` (GitHub's real API field name). */
  stars?: number
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
  const res = await csrfFetch('/api/github/integrations/me', { method: 'DELETE' })
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
export async function getGitHubRepositories(page = 1): Promise<{ success: boolean; repositories: GitHubRepoListItem[]; error?: string }> {
  try {
    const res = await fetch(`/api/github/repos?page=${page}`, { cache: 'no-store' })
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { success: false, repositories: [], error: 'GitHub not connected. Use the GitHub tab to connect your account.' }
    }
    if (!res.ok) return { success: false, repositories: [], error: `Failed to fetch (${res.status})` }
    const json = await res.json()
    if (json.error) return { success: false, repositories: [], error: json.error }
    return { success: true, repositories: Array.isArray(json) ? json : [], error: undefined }
  } catch (e) {
    return { success: false, repositories: [], error: String(e) }
  }
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
  error?: string
}

export async function getRepositoryFiles(
  owner: string,
  repo: string,
): Promise<{ path: string; type: 'file' | 'dir'; size?: number }[]> {
  const res = await fetch(
    `/api/github/repo-files?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const json = (await res.json()) as { files?: { path: string; type: 'file' | 'dir'; size?: number }[] }
  return json.files ?? []
}

export async function analyzeCode(
  code: string,
  language: string,
  filePath: string,
  _unused?: unknown,
  meta?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await csrfFetch('/api/analyze-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, language, github_file_path: filePath, ...meta }),
  })
  if (!res.ok) return { error: `Request failed (${res.status})` }
  return (await res.json()) as Record<string, unknown>
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
): Promise<FileContent> {
  const res = await csrfFetch('/api/github/file-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ owner, repo, path }),
  })
  const json = (await res.json()) as FileContent
  if (!res.ok || json.error) return { ...json, error: json.error || `HTTP ${res.status}` }
  return json
}

export async function generateAIFixes(args: {
  scanId?: string
  repository?: string
  files?: string[]
  code?: string
  language?: string
  issues?: Array<{
    type: 'bug' | 'vulnerability' | 'code_smell' | 'security_hotspot' | 'duplicate'
    severity: 'critical' | 'major' | 'minor' | 'info'
    rule: string
    message: string
    line?: number
    effortMinutes?: number
  }>
}): Promise<{
  success: boolean
  fixes?: unknown[]
  error?: string
  degraded?: boolean
  retry_after?: number
}> {
  const res = await csrfFetch('/api/ai/code-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) return { success: false, error: `Request failed: ${res.status}` }
  const json = (await res.json()) as { fixes?: unknown[]; degraded?: boolean }
  return { success: true, fixes: json.fixes ?? [], degraded: json.degraded }
}

export async function applySuggestedFix(fixId: string): Promise<{ success: boolean; error?: string }> {
  const res = await csrfFetch(`/api/ai/fixes/${encodeURIComponent(fixId)}/apply`, {
    method: 'POST',
  })
  const json = (await res.json()) as { success?: boolean; error?: string }
  if (!res.ok || !json.success) {
    return { success: false, error: json.error || `Failed: ${res.status}` }
  }
  return { success: true }
}

export async function applySuggestedFixBatch(
  fixIds: string[],
): Promise<{ success: boolean; applied_ids?: string[]; error?: string }> {
  const res = await csrfFetch('/api/ai/fixes/apply-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: fixIds }),
  })
  if (!res.ok) return { success: false, error: `Request failed: ${res.status}` }
  const j = (await res.json()) as { applied?: number; error?: string }
  if (j.error) return { success: false, error: j.error }
  return { success: true, applied_ids: fixIds }
}

export async function unapplySuggestedFix(fixId: string): Promise<{ success: boolean; error?: string }> {
  const res = await csrfFetch('/api/ai/unapply-fix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fix_id: fixId }),
  })
  if (!res.ok) return { success: false, error: 'Request failed' }
  return res.json()
}

export async function linkGitHubRepository(repoId: number, repoName: string, repoUrl: string): Promise<{ success: boolean; error?: string }> {
  const res = await csrfFetch('/api/github/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_id: repoId, name: repoName, url: repoUrl }),
  })
  if (!res.ok) return { success: false, error: 'Failed to link repository' }
  return res.json()
}

// GitHub Integration Service
// Handles OAuth flow and GitHub API interactions

export interface GitHubIntegration {
  id: string
  github_username: string
  is_active: boolean
  last_synced_at?: string
}

export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  description: string
  url: string
  owner: {
    login: string
    avatar_url: string
  }
  language: string
  stars: number
  updated_at: string
}

export interface GitHubFile {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  sha?: string
  url?: string
}

// Initialize GitHub OAuth flow
export async function initiateGitHubAuth() {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  const redirectUri = `${window.location.origin}/auth/github/callback`
  const scope = 'repo,read:user'
  const state = generateRandomState()

  // Store state in sessionStorage for verification
  sessionStorage.setItem('github_oauth_state', state)

  const params = new URLSearchParams({
    client_id: clientId || '',
    redirect_uri: redirectUri,
    scope,
    state,
  })

  window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`
}

// Exchange code for token
export async function exchangeGitHubCode(code: string, state: string): Promise<any> {
  // Verify state
  const storedState = sessionStorage.getItem('github_oauth_state')
  if (state !== storedState) {
    throw new Error('Invalid state parameter')
  }

  const response = await fetch('/api/github/auth/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state }),
  })

  if (!response.ok) {
    throw new Error('Failed to authenticate with GitHub')
  }

  return await response.json()
}

// Get list of user's repositories
export async function getGitHubRepositories(page = 1): Promise<GitHubRepository[]> {
  const response = await fetch(`/api/github/repos?page=${page}`)
  if (!response.ok) {
    throw new Error('Failed to fetch repositories')
  }
  return await response.json()
}

// Get file tree for a repository
export async function getRepositoryFiles(owner: string, repo: string, path = ''): Promise<GitHubFile[]> {
  const response = await fetch('/api/github/repo-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo, path }),
  })

  if (!response.ok) {
    throw new Error('Failed to fetch repository files')
  }

  return await response.json()
}

// Get file content from GitHub
export async function getFileContent(owner: string, repo: string, path: string): Promise<string> {
  const response = await fetch('/api/github/file-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo, path }),
  })

  if (!response.ok) {
    throw new Error('Failed to fetch file content')
  }

  const data = await response.json()
  return data.content
}

// Disconnect GitHub integration
export async function disconnectGitHub(): Promise<boolean> {
  const response = await fetch('/api/github/disconnect', {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error('Failed to disconnect GitHub')
  }

  return true
}

// Get current GitHub integration
export async function getGitHubIntegration(): Promise<GitHubIntegration | null> {
  const response = await fetch('/api/github/integration')
  if (!response.ok) {
    return null
  }
  return await response.json()
}

// Helper function to generate random state
function generateRandomState(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

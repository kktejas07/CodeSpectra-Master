import { supabase } from './supabase-client'

// GitHub Integration Service
// Handles OAuth flow, GitHub API interactions, and advanced analytics

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

export interface AnalysisMetrics {
  bugs_count: number
  vulnerabilities_count: number
  code_smells_count: number
  security_hotspots_count: number
  duplicated_lines_count: number
  cyclomatic_complexity: number
  test_coverage_percent: number
  maintainability_index: number
}

export interface CodeAnalysis {
  id: string
  file_path: string
  file_language: string
  quality_score: number
  metrics: AnalysisMetrics
  issues: any[]
  suggestions: any[]
  analyzed_at: string
}

// Initialize GitHub OAuth flow
export async function initiateGitHubAuth() {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  const redirectUri = `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/github/callback`
  const scope = 'repo,read:user,read:repo_hook'
  const state = generateRandomState()

  // Store state in sessionStorage for verification
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('github_oauth_state', state)
  }

  const params = new URLSearchParams({
    client_id: clientId || '',
    redirect_uri: redirectUri,
    scope,
    state,
  })

  if (typeof window !== 'undefined') {
    window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`
  }
}

// Exchange code for token
export async function exchangeGitHubCode(code: string, state: string): Promise<any> {
  // Verify state
  const storedState = typeof window !== 'undefined' ? sessionStorage.getItem('github_oauth_state') : null
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
export async function getGitHubRepositories(page = 1): Promise<any> {
  try {
    const response = await fetch(`/api/github/repos?page=${page}`)
    if (!response.ok) {
      throw new Error('Failed to fetch repositories')
    }
    return await response.json()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Get file tree for a repository
export async function getRepositoryFiles(owner: string, repo: string, path = ''): Promise<any> {
  try {
    const response = await fetch('/api/github/repo-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo, path }),
    })

    if (!response.ok) {
      throw new Error('Failed to fetch repository files')
    }

    return await response.json()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Get file content from GitHub
export async function getFileContent(owner: string, repo: string, path: string): Promise<any> {
  try {
    const response = await fetch('/api/github/file-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo, path }),
    })

    if (!response.ok) {
      throw new Error('Failed to fetch file content')
    }

    const data = await response.json()
    return data
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Disconnect GitHub integration
export async function disconnectGitHub(): Promise<any> {
  try {
    const response = await fetch('/api/github/disconnect', {
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Failed to disconnect GitHub')
    }

    return {
      success: true,
      message: 'GitHub disconnected',
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Get current GitHub integration
export async function getGitHubIntegration(): Promise<any> {
  try {
    const response = await fetch('/api/github/integration')
    if (!response.ok) {
      return null
    }
    return await response.json()
  } catch (error) {
    return null
  }
}

// Link GitHub repository
export async function linkGitHubRepository(
  repoId: number,
  repoName: string,
  repoUrl: string
): Promise<any> {
  try {
    const response = await fetch('/api/github/link-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoId, repoName, repoUrl }),
    })

    if (!response.ok) {
      throw new Error('Failed to link repository')
    }

    return await response.json()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Analyze code and return metrics
export async function analyzeCode(
  code: string,
  language: string,
  filePath: string = 'file',
  repoId?: string
): Promise<any> {
  try {
    const response = await fetch('/api/analyze-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        language,
        file_path: filePath,
        repo_id: repoId,
        include_metrics: [
          'bugs',
          'vulnerabilities',
          'code_smells',
          'security_hotspots',
          'duplicated_code',
          'complexity',
          'test_coverage',
          'maintainability',
        ],
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to analyze code')
    }

    return await response.json()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Get analysis history
export async function getAnalysisHistory(limit: number = 20): Promise<any> {
  try {
    const response = await fetch(`/api/analysis-history?limit=${limit}`)

    if (!response.ok) {
      throw new Error('Failed to fetch analysis history')
    }

    return await response.json()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Generate AI fixes for issues
export async function generateAIFixes(analysisId: string): Promise<any> {
  try {
    const response = await fetch('/api/generate-fixes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis_id: analysisId }),
    })

    if (!response.ok) {
      throw new Error('Failed to generate fixes')
    }

    return await response.json()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Apply suggested fix
export async function applySuggestedFix(fixId: string): Promise<any> {
  try {
    const response = await fetch('/api/apply-fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fix_id: fixId }),
    })

    if (!response.ok) {
      throw new Error('Failed to apply fix')
    }

    return await response.json()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Get quality gate configuration
export async function getQualityGates(): Promise<any> {
  try {
    const response = await fetch('/api/quality-gates')

    if (!response.ok) {
      throw new Error('Failed to fetch quality gates')
    }

    return await response.json()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Create/update quality gate
export async function saveQualityGate(gateName: string, thresholds: any): Promise<any> {
  try {
    const response = await fetch('/api/quality-gates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gate_name: gateName, ...thresholds }),
    })

    if (!response.ok) {
      throw new Error('Failed to save quality gate')
    }

    return await response.json()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Check if analysis passes quality gate
export async function checkQualityGate(analysisId: string): Promise<any> {
  try {
    const response = await fetch('/api/check-quality-gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis_id: analysisId }),
    })

    if (!response.ok) {
      throw new Error('Failed to check quality gate')
    }

    return await response.json()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

// Calculate quality score from metrics
export function calculateQualityScore(metrics: AnalysisMetrics): number {
  let score = 100

  // Deduct for bugs (each bug: -5)
  score -= Math.min(metrics.bugs_count * 5, 25)

  // Deduct for vulnerabilities (each: -8)
  score -= Math.min(metrics.vulnerabilities_count * 8, 30)

  // Deduct for code smells (each: -2)
  score -= Math.min(metrics.code_smells_count * 2, 20)

  // Deduct for low test coverage
  if (metrics.test_coverage_percent < 50) {
    score -= 15
  } else if (metrics.test_coverage_percent < 80) {
    score -= 5
  }

  // Deduct for high complexity
  if (metrics.cyclomatic_complexity > 20) {
    score -= 10
  } else if (metrics.cyclomatic_complexity > 10) {
    score -= 5
  }

  return Math.max(score, 0)
}

// Helper function to generate random state
function generateRandomState(): string {
  const array = new Uint8Array(32)
  if (typeof crypto !== 'undefined') {
    crypto.getRandomValues(array)
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}


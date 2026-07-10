import AsyncStorage from '@react-native-async-storage/async-storage'

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://codespectra.forgetechno.com'

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body ? `${res.status}: ${body.slice(0, 200)}` : `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// --- Types ---

export interface User {
  id: string
  email: string
  name?: string
  role: 'user' | 'tenant_admin' | 'superadmin'
  xp?: number
  level?: number
}

export interface Problem {
  id: string
  slug: string
  title: string
  difficulty: string
  topics: string[]
  statement_md?: string
}

export interface ScanResult {
  id: string
  scan_type: string
  language: string
  issue_count: number
  created_at: string
}

export interface Challenge {
  id: string
  title: string
  difficulty: string
  category: string
  points: number
  solved: number
  attempts: number
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

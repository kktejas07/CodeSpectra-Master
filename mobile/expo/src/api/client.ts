import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'codespectra_api_url'
const DEFAULT_URL = 'https://codespectra.forgetechno.com'

let _cachedUrl: string | null = null

export async function getApiUrl(): Promise<string> {
  if (_cachedUrl) return _cachedUrl
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY)
    if (stored) { _cachedUrl = stored; return stored }
  } catch { /* ignore */ }
  return DEFAULT_URL
}

export async function setApiUrl(url: string): Promise<void> {
  const clean = url.replace(/\/+$/, '')
  _cachedUrl = clean
  await AsyncStorage.setItem(STORAGE_KEY, clean)
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = await getApiUrl()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${base}${path}`, {
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

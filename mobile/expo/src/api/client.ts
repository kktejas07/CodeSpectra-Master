import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'codespectra_api_url'
const SESSION_KEY = 'codespectra_session'
const DEFAULT_URL = 'https://codespectra.forgetechno.com'

export async function getApiUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY)
    if (stored) return stored
  } catch { /* ignore */ }
  return DEFAULT_URL
}

export async function setApiUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''))
}

export async function getSessionToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SESSION_KEY)
  } catch { return null }
}

export async function setSessionToken(token: string): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, token)
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = await getApiUrl()
  const token = await getSessionToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${base}${path}`, {
    ...options,
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

// --- Web-aligned Types ---

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
  difficulty: 'easy' | 'medium' | 'hard'
  topics: string[]
  statement_md?: string
  input_format?: string
  output_format?: string
  constraints?: string
  time_limit_ms?: number
  memory_limit_kb?: number
}

export interface Challenge {
  id: string
  title: string
  description: string
  difficulty: string
  type?: string
  duration?: number
  successRate?: number
  completed?: boolean
  locked?: boolean
}

export interface Track {
  id: string
  name: string
  description: string
  topics: string[]
  tone?: string
  badge?: string
  difficulty?: string
  totalCourses?: number
  enrolledCount?: number
  created_at?: string
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  title: string
  level: number
  xp: number
  language: string
  languageClass: string
  avatar: string
  lastSubmission: string | null
  streak: number
  challengesSolved: number
}

export interface Achievement {
  id: number
  name: string
  description: string
  icon: string
  type?: string
  unlocked: boolean
  unlockedAt?: string
  progress: number
  maxProgress: number
}

export interface Certification {
  id: string
  slug: string
  title: string
  level: string
  category: string
  description: string
  icon: string
  duration?: number
  passing_score?: number
  source?: string
  source_url?: string
}

export interface UserStats {
  scans: number
  reviews: number
  fixes: number
  integrations: number
  challenges: number
  submissions: number
  dailyChallenges: number
  streak: number
  memberSince: string | null
}

export interface DailyChallenge {
  today: string
  problem: {
    slug: string
    title: string
    difficulty: string
    topics: string[]
  }
  streak: number
  solved_today: boolean
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// Response parsers — web APIs return {data: [...]}, some use {items: [...]}
export function unwrapData<T>(res: unknown): T[] {
  const r = res as Record<string, unknown>
  if (Array.isArray(r.data)) return r.data as T[]
  if (Array.isArray(r.items)) return r.items as T[]
  if (Array.isArray(r.entries)) return r.entries as T[]
  if (Array.isArray(r)) return r as T[]
  return []
}

export function unwrapItem<T>(res: unknown): T | null {
  const r = res as Record<string, unknown>
  if (r.problem) return r.problem as T
  if (r.user) return r.user as T
  if (r.item) return r.item as T
  return null
}
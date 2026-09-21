/**
 * API client — Bearer session JWT in SecureStore, manifest cached in
 * AsyncStorage for offline shell. No permissions, roles, or colors live
 * here; everything policy-shaped comes from /api/mobile/bootstrap.
 */
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

const TOKEN_KEY = 'codespectra_token'
const BOOTSTRAP_CACHE_KEY = 'codespectra_bootstrap'

export function apiBase(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBase?: string }
  return (extra.apiBase ?? 'https://codespectra.ai').replace(/\/+$/, '')
}

export interface BootstrapUser {
  id: string
  email: string
  name: string | null
  role: 'superadmin' | 'tenant_admin' | 'judge' | 'user'
  tenantId?: string | null
}

export interface MobileTab {
  id: string
  label: string
  icon: string
  route: string
  webRoute: string
  minRole: BootstrapUser['role']
  badge: number | null
}

export interface ThemeTokens {
  mode: 'dark' | 'light'
  primary: string
  background: string
  card: string
  text: string
  muted: string
  border: string
}

export interface BootstrapDoc {
  user: BootstrapUser
  tabs: MobileTab[]
  theme: ThemeTokens
  flags: { faceEnrollmentRequired: boolean; maintenanceMode: boolean }
  apiBase?: string
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
  } catch {
    /* already gone */
  }
  try {
    await AsyncStorage.removeItem(BOOTSTRAP_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * nativeMarker is sent on EVERY request, including login (where no session
 * token exists yet). The server treats any `Authorization: Bearer` request
 * as a non-browser client and skips the cookie double-submit CSRF check —
 * a cross-site attacker cannot set that header. Without it, the very first
 * call (mobile-token) has no cookie and no token, and gets CSRF-rejected.
 */
const NATIVE_MARKER = 'native'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || NATIVE_MARKER}`,
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401) {
    await clearToken()
    throw new Error('Session expired — please sign in again.')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body ? `${res.status}: ${body.slice(0, 200)}` : `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};

export interface LoginResponse {
  token?: string
  twoFactorRequired?: true
  user?: { id: string; email: string; role: BootstrapUser['role']; name: string | null }
  faceEnrollmentRequired?: boolean
}

export function login(email: string, password: string, totpToken?: string): Promise<LoginResponse> {
  return api.post<LoginResponse>('/api/auth/mobile-token', { email, password, totpToken });
}

export async function fetchBootstrap(mode: 'dark' | 'light' = 'dark'): Promise<BootstrapDoc> {
  const doc = await api.get<BootstrapDoc>(`/api/mobile/bootstrap?mode=${mode}`)
  try {
    await AsyncStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(doc))
  } catch {
    /* cache is best-effort */
  }
  return doc
}

export async function cachedBootstrap(): Promise<BootstrapDoc | null> {
  try {
    const raw = await AsyncStorage.getItem(BOOTSTRAP_CACHE_KEY)
    return raw ? (JSON.parse(raw) as BootstrapDoc) : null
  } catch {
    return null
  }
}

/**
 * Admin ops client (superadmin only). Mirrors the web admin routes:
 *  - worker status + unstick: /api/admin/courses/worker
 *  - LLM health board:        /api/admin/llm-health
 *  - user search + role:      /api/admin/users[/userId]
 *  - KYC review queue:        /api/admin/kyc
 * Every route re-checks superadmin server-side; the tab is gated too.
 */
import { api } from './client'

export interface WorkerStatus {
  online?: boolean
  stuck?: boolean
  hint?: string
  currentJobId?: string | null
  runningJob?: { id?: string; courseTitle?: string; progress?: number } | null
}

export interface LlmHealthRow {
  provider: string
  model: string
  status: 'ok' | 'rate_limited' | 'bad_key' | 'dead_model' | 'no_key' | 'error'
  latencyMs: number | null
  keys: number
  error?: string
  free?: boolean
}

export interface LlmHealth {
  checkedAt: string | null
  results: LlmHealthRow[]
}

export interface AdminUser {
  id: string
  email: string | null
  name: string
  full_name: string | null
  role: string
  is_active?: boolean
  lastActiveAt?: string | null
  plan?: string | null
  tenant_name?: string
}

export interface KycRecord {
  id: string
  user_id: string
  user_name: string
  user_email: string
  provider?: string
  status: string
  full_name?: string
  document_type?: string
}

export interface KycSummary {
  approved?: number
  rejected?: number
  pending?: number
  manual_review?: number
}

export async function getWorkerStatus(): Promise<WorkerStatus> {
  return api.get<WorkerStatus>('/api/admin/courses/worker')
}

export async function unstickWorker(): Promise<{ message?: string }> {
  return api.post<{ message?: string }>('/api/admin/courses/worker', { action: 'unstick' })
}

export async function getLlmHealth(): Promise<LlmHealth> {
  const res = await api.get<LlmHealth>('/api/admin/llm-health')
  return { checkedAt: res.checkedAt ?? null, results: Array.isArray(res.results) ? res.results : [] }
}

export async function testLlmProviders(): Promise<LlmHealth> {
  const res = await api.post<LlmHealth>('/api/admin/llm-health')
  return { checkedAt: res.checkedAt ?? null, results: Array.isArray(res.results) ? res.results : [] }
}

export async function searchUsers(q: string): Promise<AdminUser[]> {
  const path = q.trim() ? `/api/admin/users?search=${encodeURIComponent(q.trim())}` : '/api/admin/users'
  const res = await api.get<{ users?: AdminUser[] }>(path)
  return Array.isArray(res.users) ? res.users : []
}

export async function setUserRole(userId: string, role: string): Promise<void> {
  await api.patch(`/api/admin/users/${encodeURIComponent(userId)}`, { role })
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
  await api.patch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    status: active ? 'active' : 'inactive',
  })
}

export async function listKyc(): Promise<{ records: KycRecord[]; summary: KycSummary }> {
  const res = await api.get<{ records?: KycRecord[]; summary?: KycSummary }>('/api/admin/kyc')
  return {
    records: Array.isArray(res.records) ? res.records : [],
    summary: res.summary ?? {},
  }
}

/** KYC records needing attention: anything not cleanly approved/rejected. */
export function kycNeedsReview(records: KycRecord[]): KycRecord[] {
  return records.filter((r) => !['approved', 'rejected'].includes(String(r.status || '').toLowerCase()))
}

export const ROLES = ['user', 'judge', 'tenant_admin', 'superadmin'] as const

export function roleTone(role: string): string {
  switch (role) {
    case 'superadmin':
      return '#A855F7'
    case 'tenant_admin':
      return '#38BDF8'
    case 'judge':
      return '#EAB308'
    default:
      return '#94A3B8'
  }
}

export function healthColor(status: LlmHealthRow['status']): string {
  switch (status) {
    case 'ok':
      return '#22C55E'
    case 'rate_limited':
      return '#EAB308'
    case 'no_key':
      return '#94A3B8'
    default:
      return '#EF4444'
  }
}

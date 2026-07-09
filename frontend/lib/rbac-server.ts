'use server'

import { cookies } from 'next/headers'
import { verifySessionToken } from './session'
import { normalizeUserRole, UserRole, UserWithPermissions } from './rbac'

const SESSION_COOKIE = 'codespectra_session'

export async function getCurrentUser(): Promise<UserWithPermissions | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return null

    const payload = await verifySessionToken(token)
    if (!payload) return null

    const role: UserRole = normalizeUserRole(payload.role)

    return {
      id: payload.uid,
      email: payload.email,
      full_name: payload.email.split('@')[0] ?? null,
      role,
      is_active: true,
      tenant_id: undefined,
    }
  } catch (error) {
    console.error('[CodeSpectra] Error fetching current user:', error)
    return null
  }
}

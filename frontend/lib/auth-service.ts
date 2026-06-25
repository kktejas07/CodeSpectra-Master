/**
 * Phase 7 stub — legacy Supabase auth-service helpers.
 * All real auth now goes through Better Auth (`@/lib/auth`, `@/lib/auth-client`).
 * These functions remain only to keep a few orphaned dashboard pages compiling.
 */

export interface AuthResponse {
  success: boolean
  message?: string
  error?: string
  user?: unknown
  session?: unknown
}

const DEAD =
  "Supabase auth-service was removed. Use Better Auth from '@/lib/auth-client'."

export async function signUp(
  ..._args: unknown[]
): Promise<AuthResponse> {
  return { success: false, error: DEAD }
}

export async function signIn(..._args: unknown[]): Promise<AuthResponse> {
  return { success: false, error: DEAD }
}

export async function signOut(): Promise<AuthResponse> {
  return { success: false, error: DEAD }
}

export async function getCurrentUser() {
  return null
}

export async function getSession() {
  return null
}

export async function signInWithGoogle(): Promise<AuthResponse> {
  return { success: false, error: DEAD }
}

export async function signInWithGithub(): Promise<AuthResponse> {
  return { success: false, error: DEAD }
}

export async function enrollFaceRecognition(
  ..._args: unknown[]
): Promise<AuthResponse> {
  return { success: false, error: DEAD }
}

export async function skipFaceEnrollment(_userId: string): Promise<AuthResponse> {
  return { success: false, error: DEAD }
}

export async function verifyFaceLogin(
  ..._args: unknown[]
): Promise<AuthResponse> {
  return { success: false, error: DEAD }
}

export async function checkFaceEnrollmentReminder(_userId: string) {
  return { needsReminder: false }
}

export async function getUserProfile(_userId: string): Promise<AuthResponse> {
  return { success: false, error: DEAD }
}

export async function updateUserProfile(..._args: unknown[]): Promise<AuthResponse> {
  return { success: false, error: DEAD }
}

/**
 * MongoDB repositories for AI features.
 *
 * Collections:
 *   - ai_chat_sessions      : { id, user_id, title, model_role, created_at, updated_at }
 *   - ai_chat_messages      : { id, session_id, user_id, role, content, created_at }
 *   - ai_code_reviews       : { id, user_id, scan_id?, problem_id?, payload, created_at }
 *   - ai_grades             : { id, user_id, submission_id?, code, rubric, result, created_at }
 *   - ai_generated_problems : { id, user_id, payload, published_problem_id?, created_at }
 *   - proctor_events        : { id, user_id, session_kind, session_id, event_type, meta, created_at }
 *   - identity_verifications: { id, user_id, selfie_url?, id_url?, result, created_at }
 *   - skill_insights_cache  : { id, user_id, result, created_at }
 */
import { randomUUID } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export const nowIso = (): string => new Date().toISOString()
export const newId = (): string => randomUUID()

export interface AiChatSessionDoc {
  id: string
  user_id: string
  title: string
  model_role: string
  created_at: string
  updated_at: string
}

export interface AiChatMessageDoc {
  id: string
  session_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ProctorEventDoc {
  id: string
  user_id: string
  session_kind: 'exam' | 'problem' | 'interview'
  session_id: string
  event_type: string
  meta?: Record<string, unknown>
  created_at: string
}

export interface IdentityVerificationDoc {
  id: string
  user_id: string
  selfie_data_url?: string
  id_data_url?: string
  result: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'manual_review'
  created_at: string
}

export interface AiCodeReviewDoc {
  id: string
  user_id: string
  scan_id?: string
  problem_slug?: string
  language: string
  result: Record<string, unknown>
  created_at: string
}

export interface AiGradeDoc {
  id: string
  user_id: string
  submission_id?: string
  problem_slug?: string
  rubric: Record<string, number>
  result: Record<string, unknown>
  created_at: string
}

export interface AiGeneratedProblemDoc {
  id: string
  user_id: string
  payload: Record<string, unknown>
  published_problem_id?: string | null
  created_at: string
}

export async function aiChatSessions(): Promise<Collection<AiChatSessionDoc>> {
  const db = await getMongoDb()
  return db.collection<AiChatSessionDoc>('ai_chat_sessions')
}
export async function aiChatMessages(): Promise<Collection<AiChatMessageDoc>> {
  const db = await getMongoDb()
  return db.collection<AiChatMessageDoc>('ai_chat_messages')
}
export async function aiCodeReviews(): Promise<Collection<AiCodeReviewDoc>> {
  const db = await getMongoDb()
  return db.collection<AiCodeReviewDoc>('ai_code_reviews')
}
export async function aiGrades(): Promise<Collection<AiGradeDoc>> {
  const db = await getMongoDb()
  return db.collection<AiGradeDoc>('ai_grades')
}
export async function aiGeneratedProblems(): Promise<Collection<AiGeneratedProblemDoc>> {
  const db = await getMongoDb()
  return db.collection<AiGeneratedProblemDoc>('ai_generated_problems')
}
export async function proctorEvents(): Promise<Collection<ProctorEventDoc>> {
  const db = await getMongoDb()
  return db.collection<ProctorEventDoc>('proctor_events')
}
export async function identityVerifications(): Promise<Collection<IdentityVerificationDoc>> {
  const db = await getMongoDb()
  return db.collection<IdentityVerificationDoc>('identity_verifications')
}

import { newId, nowIso } from './ids'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export { newId, nowIso }

export interface InterviewSessionDoc {
  id: string
  title: string
  type: 'technical' | 'behavioral' | 'system-design' | 'coding'
  role: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  scheduled_at: string
  started_at?: string
  completed_at?: string
  duration_minutes: number
  /** ID of the interviewer (admin/recruiter who created it) */
  interviewer_id: string
  /** ID of the candidate taking the interview */
  candidate_id: string
  /** Resume text or parsed info for AI context */
  resume_info?: string
  /** AI-generated or manual questions */
  questions: InterviewQuestionDoc[]
  /** Overall feedback scores */
  feedback?: InterviewFeedbackDoc[]
  /** Average score across all dimensions */
  overall_score?: number
  /** Summary/notes from interviewer */
  notes?: string
  tenant_id?: string | null
  created_at: string
  updated_at: string
}

export interface InterviewQuestionDoc {
  id: string
  question: string
  category: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  order: number
  time_limit_seconds: number
  answer?: string
  time_spent_seconds?: number
  skipped?: boolean
  ai_follow_up?: string
}

export interface InterviewFeedbackDoc {
  dimension: string
  score: number
  feedback: string
  suggestions: string[]
}

export async function interviewSessions(): Promise<Collection<InterviewSessionDoc>> {
  return (await getMongoDb()).collection<InterviewSessionDoc>('interviews')
}

export async function createInterviewSession(data: {
  title: string
  type: InterviewSessionDoc['type']
  role: string
  interviewer_id: string
  candidate_id: string
  scheduled_at: string
  duration_minutes: number
  resume_info?: string
  tenant_id?: string | null
}): Promise<InterviewSessionDoc> {
  const col = await interviewSessions()
  const doc: InterviewSessionDoc = {
    id: newId(),
    title: data.title,
    type: data.type,
    role: data.role,
    status: 'scheduled',
    scheduled_at: data.scheduled_at,
    duration_minutes: data.duration_minutes,
    interviewer_id: data.interviewer_id,
    candidate_id: data.candidate_id,
    resume_info: data.resume_info,
    questions: [],
    tenant_id: data.tenant_id ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  await col.insertOne(doc)
  return doc
}

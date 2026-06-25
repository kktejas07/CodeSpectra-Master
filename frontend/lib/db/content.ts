/**
 * MongoDB repository for Phase 5 content: codeathons, exams, jobs,
 * job applications, resumes.
 *
 * All documents use string `id` (UUID v4) so existing API/UI shapes are
 * unchanged.
 */
import { randomUUID } from 'crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export function newId(): string {
  return randomUUID()
}
export function nowIso(): string {
  return new Date().toISOString()
}

export interface CodeathonDoc {
  id: string
  title: string
  description: string
  start_date: string
  end_date: string
  prize_pool?: string | null
  participants: number
  status: 'upcoming' | 'live' | 'completed' | 'archived'
  rules?: string | null
  tracks?: string[]
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface CodeathonRegistrationDoc {
  id: string
  codeathon_id: string
  user_id: string
  team_name?: string | null
  registered_at: string
}

export interface ExamDoc {
  id: string
  title: string
  subject?: string | null
  difficulty_level?: string | null
  duration?: number | null
  passing_score?: number | null
  description?: string | null
  status: 'available' | 'archived' | 'draft'
  questions?: Array<{
    id: string
    text: string
    type: string
    options?: string[]
    correctAnswer?: number
  }>
  created_by?: string | null
  created_at: string
}

export interface ExamSubmissionDoc {
  id: string
  exam_id: string
  user_id: string
  score: number
  passed: boolean
  certificate_url?: string | null
  submitted_at: string
}

export interface JobDoc {
  id: string
  title: string
  company?: string | null
  location?: string | null
  job_type?: string | null
  experience_level?: string | null
  description?: string | null
  requirements?: string | null
  benefits?: string | null
  skills?: string[]
  salary?: { min?: number; max?: number; currency?: string } | null
  applicants: number
  is_active: boolean
  created_by?: string | null
  created_at: string
}

export interface JobApplicationDoc {
  id: string
  job_id: string
  user_id: string
  resume_id?: string | null
  cover_letter?: string | null
  status: 'submitted' | 'in_review' | 'rejected' | 'accepted' | 'withdrawn'
  applied_at: string
}

export interface ResumeDoc {
  id: string
  user_id: string
  file_name: string
  file_size: number
  storage_url?: string | null
  is_primary: boolean
  status: 'uploaded' | 'analyzing' | 'analyzed' | 'failed'
  analysis?: Record<string, unknown> | null
  uploaded_at: string
}

async function db() {
  return getMongoDb()
}

export async function codeathons(): Promise<Collection<CodeathonDoc>> {
  return (await db()).collection<CodeathonDoc>('codeathons')
}
export async function codeathonRegistrations(): Promise<Collection<CodeathonRegistrationDoc>> {
  return (await db()).collection<CodeathonRegistrationDoc>('codeathon_registrations')
}
export async function exams(): Promise<Collection<ExamDoc>> {
  return (await db()).collection<ExamDoc>('exams')
}
export async function examSubmissions(): Promise<Collection<ExamSubmissionDoc>> {
  return (await db()).collection<ExamSubmissionDoc>('exam_submissions')
}
export async function jobs(): Promise<Collection<JobDoc>> {
  return (await db()).collection<JobDoc>('job_postings')
}
export async function jobApplications(): Promise<Collection<JobApplicationDoc>> {
  return (await db()).collection<JobApplicationDoc>('job_applications')
}
export async function resumes(): Promise<Collection<ResumeDoc>> {
  return (await db()).collection<ResumeDoc>('resumes')
}
